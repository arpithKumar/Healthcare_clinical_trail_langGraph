import logging

from fastapi import APIRouter, HTTPException
from langchain_core.messages import AIMessage

from src.coding import map_to_icd10
from src.dependencies import cache_flush, graph_manager, reverse_chain
from src.extract import extract_trial_data
from src.models import EligibleProfileResponse, IngestionRequest, IngestionResponse

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/trials/ingest", response_model=IngestionResponse, tags=["ETL"])
def ingest_trial(request: IngestionRequest):
    try:
        extracted_data = extract_trial_data(request.text)
        # Enrich conditions with ICD-10 codes before graph storage
        for condition in (
            extracted_data.conditions_treated + extracted_data.conditions_excluded
        ):
            condition.icd10_code = map_to_icd10(condition.name)
        graph_manager.ingest_trial(
            trial_id=request.trial_id, extracted_data=extracted_data
        )
        cache_flush()
        return {
            "status": "success",
            "trial_id": request.trial_id,
            "extracted_entities": extracted_data.model_dump(),
        }
    except Exception as e:
        logger.error("Ingestion failed: %s", e)
        raise HTTPException(status_code=500, detail=f"Ingestion failed: {str(e)}")


@router.post(
    "/trials/{trial_id}/eligible-profile",
    response_model=EligibleProfileResponse,
    tags=["Agent"],
)
def get_eligible_profile(trial_id: str):
    """Generate a natural-language ideal patient profile for a given trial."""
    context = graph_manager.get_trial_context(trial_id)
    if context is None:
        raise HTTPException(status_code=404, detail=f"Trial '{trial_id}' not found.")

    try:
        min_age: int | None = context["min_age"]
        max_age: int | None = context["max_age"]
        if min_age and max_age:
            age_range = f"{min_age} to {max_age} years"
        elif min_age:
            age_range = f"At least {min_age} years"
        elif max_age:
            age_range = f"Up to {max_age} years"
        else:
            age_range = "Not specified"

        response = reverse_chain.invoke(
            {
                "trial_title": context["trial_title"] or trial_id,
                "conditions_treated": ", ".join(context["conditions_treated"])
                or "Not specified",
                "medications_used": ", ".join(context["medications_used"])
                or "Not specified",
                "age_range": age_range,
                "conditions_excluded": ", ".join(context["conditions_excluded"])
                or "None",
                "medications_excluded": ", ".join(context["medications_excluded"])
                or "None",
            }
        )
        ideal_profile = (
            response.content if isinstance(response, AIMessage) else str(response)
        )

        logger.info("Reverse-match profile generated for trial %s.", trial_id)
        return {
            "trial_id": context["trial_id"],
            "trial_title": context["trial_title"] or trial_id,
            "ideal_profile": str(ideal_profile).strip(),
        }

    except Exception as e:
        logger.error("Eligible profile generation failed for %s: %s", trial_id, e)
        raise HTTPException(
            status_code=500, detail=f"Profile generation failed: {str(e)}"
        )
