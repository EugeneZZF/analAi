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
    isPublic
    authorId
    isAdded
    authorName
    projectId
    author
    version
    createdAt
    updatedAt
  }
`;

export const LIST_SKILLS = gql`
  query Skills($scope: String) {
    skills(scope: $scope) {
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

export const ADD_SKILL_TO_USER = gql`
  mutation AddSkillToUser($where: SkillWhereInput!) {
    addSkillToUser(where: $where)
  }
`;

export const REMOVE_SKILL_FROM_USER = gql`
  mutation RemoveSkillFromUser($where: SkillWhereInput!) {
    removeSkillFromUser(where: $where)
  }
`;
