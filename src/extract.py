import logging
import os, re

from dotenv import load_dotenv
from langchain_ollama import ChatOllama
from langchain_core.prompts import ChatPromptTemplate

from src.schema import ExtractedEntities

load_dotenv()

logger = logging.getLogger(__name__)

llm = ChatOllama(
    model=os.getenv("LLM_MODEL", "llama3"),
    temperature=0,
    base_url=os.getenv("OLLAMA_BASE_URL", "http://localhost:11434"),
)

structured_llm = llm.with_structured_output(ExtractedEntities)

prompt = ChatPromptTemplate.from_messages(
    [
        (
            "system",
            """You are an expert clinical trial data extractor.
Extract the entities from the provided text exactly as defined in the schema.

CRITICAL INSTRUCTIONS:
1. 'conditions' are diseases, illnesses, or symptoms.
2. 'medications' are drugs, treatments, or supplements.
3. You MUST distinguish between what is being treated/used vs what is EXCLUDED.
4. Anything listed after "Exclusion criteria" MUST go into 'conditions_excluded' or 'medications_excluded'.
5. Do not place excluded items into the 'treated' or 'used' arrays.
6. Extract exact 'min_age' and 'max_age' integers and 'gender' string for eligibility.
7. Extract the official 'trial_title'.
8. Do not hallucinate. If a value is not present, omit it.""",
        ),
        ("human", "{text}"),
    ]
)

extraction_chain = prompt | structured_llm


def extract_trial_data(text: str) -> ExtractedEntities:
    """Passes raw clinical trial text to Llama 3 for structured extraction."""
    logger.info("Extracting entities via Llama 3...")
    res = extraction_chain.invoke({"text": text})

    if not isinstance(res, ExtractedEntities):
        raise ValueError(
            f"LLM returned unexpected type: {type(res)}. Expected ExtractedEntities."
        )
    return res


CONFIDENCE_THRESHOLD = 0.6


def assess_extraction_confidence(text: str, entities: ExtractedEntities) -> float:
    """Ask the LLM to self-score the quality of its extraction (0.0 – 1.0).
    Falls back to 1.0 on any failure so ingestion is never blocked by this step.
    """
    prompt_text = (
        "You extracted the following entities from a clinical trial description.\n\n"
        f"Trial title: {entities.trial_title}\n"
        f"Conditions treated: {[c.name for c in entities.conditions_treated]}\n"
        f"Medications used: {[m.name for m in entities.medications_used]}\n"
        f"Conditions excluded: {[c.name for c in entities.conditions_excluded]}\n"
        f"Medications excluded: {[m.name for m in entities.medications_excluded]}\n\n"
        "Original text (first 800 characters):\n"
        f"{text[:800]}\n\n"
        "On a scale of 0.0 to 1.0, how accurate and complete is this extraction?\n"
        "Return ONLY a decimal number between 0.0 and 1.0, e.g. 0.85. No other text."
    )
    try:
        response = llm.invoke(prompt_text)
        raw = response.content if hasattr(response, "content") else str(response)
        match = re.search(r"\b(0\.\d+|1\.0+|0|1)\b", str(raw))
        if match:
            return max(0.0, min(1.0, float(match.group())))
    except Exception as e:
        logger.warning("Confidence assessment failed: %s — defaulting to 1.0", e)
    return 1.0


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)

    sample_text = """
    This phase 3 clinical trial investigates the efficacy of Metformin
    for treating Type 2 Diabetes.
    Patients must be between 18 and 65 years old.
    Exclusion criteria: Patients with severe kidney disease or those currently taking Insulin.
    """

    result = extract_trial_data(sample_text)
    print(result.model_dump_json(indent=2))
