import logging

from fastapi import APIRouter, HTTPException

from src.dependencies import graph_manager
from src.models import (
    PatientProfileCreate,
    PatientProfileResponse,
    PatientProfileUpdate,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/patient-profiles", tags=["patient-profiles"])


@router.post("", response_model=PatientProfileResponse, status_code=201)
async def create_profile(body: PatientProfileCreate) -> PatientProfileResponse:
    data = graph_manager.create_patient_profile(
        name=body.name,
        age=body.age,
        gender=body.gender,
        conditions=body.conditions,
        medications=body.medications,
        notes=body.notes,
    )
    return PatientProfileResponse(**data)


@router.get("", response_model=list[PatientProfileResponse])
async def list_profiles() -> list[PatientProfileResponse]:
    profiles = graph_manager.list_patient_profiles()
    return [PatientProfileResponse(**p) for p in profiles]


@router.get("/{profile_id}", response_model=PatientProfileResponse)
async def get_profile(profile_id: str) -> PatientProfileResponse:
    data = graph_manager.get_patient_profile(profile_id)
    if data is None:
        raise HTTPException(
            status_code=404,
            detail=f"Patient profile {profile_id!r} not found",
        )
    return PatientProfileResponse(**data)


@router.patch("/{profile_id}", response_model=PatientProfileResponse)
async def update_profile(
        profile_id: str, body: PatientProfileUpdate
) -> PatientProfileResponse:
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=422, detail="No fields provided for update")
    data = graph_manager.update_patient_profile(profile_id, updates)
    if data is None:
        raise HTTPException(
            status_code=404,
            detail=f"Patient profile {profile_id!r} not found",
        )
    return PatientProfileResponse(**data)


@router.delete("/{profile_id}", status_code=204)
async def delete_profile(profile_id: str) -> None:
    deleted = graph_manager.delete_patient_profile(profile_id)
    if not deleted:
        raise HTTPException(
            status_code=404,
            detail=f"Patient profile {profile_id!r} not found",
        )
