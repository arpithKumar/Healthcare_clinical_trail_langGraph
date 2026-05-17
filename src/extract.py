import logging
import os
from typing import cast

from dotenv import load_dotenv
from langchain_ollama import ChatOllama
from langchain_core.prompts import ChatPromptTemplate

from src.schema import ExtractedEntities

load_dotenv()

logger = logging.getLogger(__name__)

llm = ChatOllama(
    model="llama3",
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
    result = extraction_chain.invoke({"text": text})

    if not isinstance(result, ExtractedEntities):
        raise ValueError(
            f"LLM returned unexpected type: {type(result)}. Expected ExtractedEntities."
        )

    return cast(ExtractedEntities, result)


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
