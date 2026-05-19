import logging, json, re

from fastapi import APIRouter, HTTPException, Query
from langchain_core.messages import AIMessage

from src.coding import map_to_icd10
from src.dependencies import cache_flush, eligibility_chain, graph_manager, reverse_chain
from src.extract import extract_trial_data, assess_extraction_confidence, CONFIDENCE_THRESHOLD
from src.models import (
    EligibilityCriterion,
    EligibilityRequest,
    EligibilityResponse,
    EligibleProfileResponse,
    PendingReviewItem,
    IngestionRequest,
    IngestionResponse,
    SimilarTrial,
    TrialDetail,
)

logger = logging.getLogger(__name__)

router = APIRouter()


def _parse_eligibility(
        raw: str, fallback_criteria: list[str]
) -> list[EligibilityCriterion]:
    for text in (raw, (m.group() if (m := re.search(r"\[.*]", raw, re.DOTALL)) else None)):
        if not text:
            continue
        try:
            parsed = json.loads(text)
            if isinstance(parsed, list):
                return [EligibilityCriterion(**item) for item in parsed]
        except (json.JSONDecodeError, TypeError, ValueError):
            continue
    return [
        EligibilityCriterion(criterion=c, verdict="unknown", reason="Could not evaluate")
        for c in fallback_criteria
    ]


@router.post("/trials/ingest", response_model=IngestionResponse, tags=["ETL"])
def ingest_trial(request: IngestionRequest):
    try:
        extracted_data = extract_trial_data(request.text)
        for condition in (
                extracted_data.conditions_treated + extracted_data.conditions_excluded
        ):
            condition.icd10_code = map_to_icd10(condition.name)

        confidence = assess_extraction_confidence(request.text, extracted_data)

        if confidence < CONFIDENCE_THRESHOLD:
            logger.warning(
                "Trial %s has low extraction confidence (%.2f) — queued for review",
                request.trial_id, confidence,
            )
            graph_manager.ingest_pending_review(
                trial_id=request.trial_id,
                text=request.text,
                extracted_json=extracted_data.model_dump_json(),
                confidence=confidence,
            )
            return {
                "status": "pending_review",
                "trial_id": request.trial_id,
                "extracted_entities": extracted_data.model_dump(),
            }

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


@router.get("/trials/review", response_model=list[PendingReviewItem], tags=["Admin"])
def list_review_queue():
    """Return all trials awaiting human review due to low extraction confidence."""
    try:
        return graph_manager.list_pending_reviews()
    except Exception as e:
        logger.error("Review queue fetch failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/trials/review/{review_id}/approve", tags=["Admin"])
def approve_review(review_id: str):
    """Approve a pending review item and promote it to the knowledge graph."""
    trial_id = graph_manager.approve_pending_review(review_id)
    if trial_id is None:
        raise HTTPException(
            status_code=404,
            detail=f"Review item {review_id!r} not found",
        )
    cache_flush()
    return {"status": "approved", "trial_id": trial_id}


@router.post("/trials/review/{review_id}/reject", tags=["Admin"])
def reject_review(review_id: str):
    """Reject and permanently discard a pending review item."""
    deleted = graph_manager.reject_pending_review(review_id)
    if not deleted:
        raise HTTPException(
            status_code=404,
            detail=f"Review item {review_id!r} not found",
        )
    return {"status": "rejected"}


@router.get("/trials/{trial_id}", response_model=TrialDetail, tags=["Trials"])
def get_trial_detail(trial_id: str):
    """Fetch full structured profile for a single trial."""
    detail = graph_manager.get_trial_detail(trial_id)
    if detail is None:
        raise HTTPException(status_code=404, detail=f"Trial '{trial_id}' not found.")
    return detail


@router.get("/trials/{trial_id}/similar", response_model=list[SimilarTrial], tags=["Trials"])
def get_similar_trials(
        trial_id: str,
        exclude: str = Query(default=""),
        limit: int = Query(default=6, ge=1, le=20),
):
    """Return trials structurally similar to the given trial (≥2 shared nodes)."""
    exclude_ids = [t.strip() for t in exclude.split(",") if t.strip()]
    try:
        return graph_manager.get_similar_trials(
            trial_id=trial_id, exclude_ids=exclude_ids, limit=limit
        )
    except Exception as e:
        logger.error("Similar trials fetch failed for %s: %s", trial_id, e)
        raise HTTPException(status_code=500, detail=str(e))


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


@router.post(
    "/trials/{trial_id}/eligibility",
    response_model=EligibilityResponse,
    tags=["Trials"],
)
def evaluate_eligibility(trial_id: str, body: EligibilityRequest) -> EligibilityResponse:
    criteria_data = graph_manager.get_trial_criteria(trial_id)
    if not criteria_data:
        raise HTTPException(status_code=404, detail="Trial not found")

    # Build structured criteria list from graph data
    criteria_list: list[str] = []
    min_age = criteria_data.get("min_age")
    max_age = criteria_data.get("max_age")
    if min_age and max_age:
        criteria_list.append(f"Patient age must be between {min_age} and {max_age} years")
    elif min_age:
        criteria_list.append(f"Patient age must be at least {min_age} years")
    elif max_age:
        criteria_list.append(f"Patient age must be at most {max_age} years")

    for c in criteria_data.get("included_conditions", []):
        criteria_list.append(f"Patient must have condition: {c}")
    for c in criteria_data.get("excluded_conditions", []):
        criteria_list.append(f"Patient must NOT have condition: {c}")
    for m in criteria_data.get("excluded_medications", []):
        criteria_list.append(f"Patient must NOT be taking medication: {m}")

    if not criteria_list:
        return EligibilityResponse(trial_id=trial_id, criteria=[])

    numbered = "\n".join(f"{i + 1}. {c}" for i, c in enumerate(criteria_list))
    prompt = (
        "You are a clinical trial eligibility assessor.\n\n"
        f"Patient profile:\n{body.profile}\n\n"
        "Evaluate each criterion below against the patient profile.\n"
        'Return ONLY a JSON array — no prose, no markdown — with this exact structure:\n'
        '[{"criterion": "...", "verdict": "pass" | "fail" | "unknown", "reason": "one sentence"}]\n\n'
        f"Criteria:\n{numbered}"
    )

    response = eligibility_chain.invoke(prompt)
    raw: str = str(response.content) if isinstance(response, AIMessage) else str(response)
    criteria = _parse_eligibility(raw, criteria_list)
    return EligibilityResponse(trial_id=trial_id, criteria=criteria)
