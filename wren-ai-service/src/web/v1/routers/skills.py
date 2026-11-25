from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel

from src.globals import ServiceContainer, get_service_container
from src.web.v1.services.skills import (
    SkillCreateOrUpdateRequest,
    SkillDocument,
    SkillImportRequest,
)

router = APIRouter()


class SkillsListResponse(BaseModel):
    skills: List[SkillDocument]


class SkillMatchRequest(BaseModel):
    query: str
    project_id: Optional[str] = None
    skill_ids: Optional[List[str]] = None
    top_k: int = 3


@router.get("/skills")
async def list_skills(
    project_id: Optional[str] = None,
    include_disabled: bool = True,
    container: ServiceContainer = Depends(get_service_container),
) -> SkillsListResponse:
    skills = container.skills_service.list_skills(
        project_id=project_id,
        include_disabled=include_disabled,
    )
    return SkillsListResponse(skills=skills)


@router.get("/skills/{skill_id}")
async def get_skill(
    skill_id: str,
    container: ServiceContainer = Depends(get_service_container),
) -> SkillDocument:
    skill = container.skills_service.get_skill(skill_id)
    if not skill:
        raise HTTPException(status_code=404, detail=f"Skill '{skill_id}' not found")
    return skill


@router.get("/skills/{skill_id}/export", response_class=PlainTextResponse)
async def export_skill_markdown(
    skill_id: str,
    container: ServiceContainer = Depends(get_service_container),
) -> PlainTextResponse:
    skill = container.skills_service.get_skill(skill_id)
    if not skill:
        raise HTTPException(status_code=404, detail=f"Skill '{skill_id}' not found")
    return PlainTextResponse(
        content=skill.raw_markdown,
        media_type="text/markdown; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{skill.slug}-SKILL.md"'
        },
    )


@router.post("/skills")
async def create_or_update_skill(
    request: SkillCreateOrUpdateRequest,
    container: ServiceContainer = Depends(get_service_container),
) -> SkillDocument:
    return container.skills_service.save_skill(request)


@router.put("/skills/{skill_id}")
async def update_skill(
    skill_id: str,
    request: SkillCreateOrUpdateRequest,
    container: ServiceContainer = Depends(get_service_container),
) -> SkillDocument:
    request.id = skill_id
    return container.skills_service.save_skill(request)


@router.post("/skills/import")
async def import_skill(
    request: SkillImportRequest,
    container: ServiceContainer = Depends(get_service_container),
) -> SkillDocument:
    return container.skills_service.import_skill(request)


@router.post("/skills/match")
async def match_skills(
    request: SkillMatchRequest,
    container: ServiceContainer = Depends(get_service_container),
) -> SkillsListResponse:
    matched = container.skills_service.match_skills(
        query=request.query,
        project_id=request.project_id,
        explicit_skill_ids=request.skill_ids,
        top_k=request.top_k,
    )
    return SkillsListResponse(skills=matched)


@router.delete("/skills/{skill_id}")
async def delete_skill(
    skill_id: str,
    container: ServiceContainer = Depends(get_service_container),
) -> dict:
    deleted = container.skills_service.delete_skill(skill_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Skill '{skill_id}' not found")
    return {"ok": True, "id": skill_id}
