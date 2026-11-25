import { gql } from '@apollo/client';

export const SKILL = gql`
  fragment Skill on Skill {
    id
    slug
    name
    description
    category
    tags
    triggers
    questions
    content
    rawMarkdown
    enabled
    isGlobal
    isShared
    isBuiltin
    projectId
    author
    version
    createdAt
    updatedAt
  }
`;

export const LIST_SKILLS = gql`
  query Skills {
    skills {
      ...Skill
    }
  }
  ${SKILL}
`;

export const CREATE_SKILL = gql`
  mutation CreateSkill($data: CreateSkillInput!) {
    createSkill(data: $data) {
      ...Skill
    }
  }
  ${SKILL}
`;

export const UPDATE_SKILL = gql`
  mutation UpdateSkill($where: SkillWhereInput!, $data: UpdateSkillInput!) {
    updateSkill(where: $where, data: $data) {
      ...Skill
    }
  }
  ${SKILL}
`;

export const IMPORT_SKILL = gql`
  mutation ImportSkill($data: ImportSkillInput!) {
    importSkill(data: $data) {
      ...Skill
    }
  }
  ${SKILL}
`;

export const DELETE_SKILL = gql`
  mutation DeleteSkill($where: SkillWhereInput!) {
    deleteSkill(where: $where)
  }
`;
