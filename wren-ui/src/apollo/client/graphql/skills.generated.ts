import * as Types from './__types__';

import { gql } from '@apollo/client';
import * as Apollo from '@apollo/client';
const defaultOptions = {} as const;

export type SkillFragment = {
  __typename?: 'Skill';
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  tags: Array<string>;
  triggers: Array<string>;
  questions: Array<string>;
  content: string;
  rawMarkdown: string;
  enabled: boolean;
  isGlobal: boolean;
  isShared: boolean;
  isBuiltin: boolean;
  projectId?: string | null;
  author: string;
  version: string;
  isPublic: boolean;
  authorId?: number | null;
  isAdded: boolean;
  authorName?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SkillsQueryVariables = Types.Exact<{
  scope?: Types.InputMaybe<Types.Scalars['String']>;
}>;

export type SkillsQuery = {
  __typename?: 'Query';
  skills: Array<SkillFragment>;
};

export type CreateSkillMutationVariables = Types.Exact<{
  data: Types.CreateSkillInput;
}>;

export type CreateSkillMutation = {
  __typename?: 'Mutation';
  createSkill: SkillFragment;
};

export type UpdateSkillMutationVariables = Types.Exact<{
  where: Types.SkillWhereInput;
  data: Types.UpdateSkillInput;
}>;

export type UpdateSkillMutation = {
  __typename?: 'Mutation';
  updateSkill: SkillFragment;
};

export type ImportSkillMutationVariables = Types.Exact<{
  data: Types.ImportSkillInput;
}>;

export type ImportSkillMutation = {
  __typename?: 'Mutation';
  importSkill: SkillFragment;
};

export type DeleteSkillMutationVariables = Types.Exact<{
  where: Types.SkillWhereInput;
}>;

export type DeleteSkillMutation = {
  __typename?: 'Mutation';
  deleteSkill: boolean;
};

export const SkillFragmentDoc = gql`
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
    isPublic
    authorId
    isAdded
    authorName
    createdAt
    updatedAt
  }
`;

export const SkillsDocument = gql`
  query Skills($scope: String) {
    skills(scope: $scope) {
      ...Skill
    }
  }
  ${SkillFragmentDoc}
`;

export function useSkillsQuery(
  baseOptions?: Apollo.QueryHookOptions<SkillsQuery, SkillsQueryVariables>,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useQuery<SkillsQuery, SkillsQueryVariables>(
    SkillsDocument,
    options,
  );
}

export function useSkillsLazyQuery(
  baseOptions?: Apollo.LazyQueryHookOptions<SkillsQuery, SkillsQueryVariables>,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useLazyQuery<SkillsQuery, SkillsQueryVariables>(
    SkillsDocument,
    options,
  );
}

export const CreateSkillDocument = gql`
  mutation CreateSkill($data: CreateSkillInput!) {
    createSkill(data: $data) {
      ...Skill
    }
  }
  ${SkillFragmentDoc}
`;

export function useCreateSkillMutation(
  baseOptions?: Apollo.MutationHookOptions<
    CreateSkillMutation,
    CreateSkillMutationVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useMutation<CreateSkillMutation, CreateSkillMutationVariables>(
    CreateSkillDocument,
    options,
  );
}

export const UpdateSkillDocument = gql`
  mutation UpdateSkill($where: SkillWhereInput!, $data: UpdateSkillInput!) {
    updateSkill(where: $where, data: $data) {
      ...Skill
    }
  }
  ${SkillFragmentDoc}
`;

export function useUpdateSkillMutation(
  baseOptions?: Apollo.MutationHookOptions<
    UpdateSkillMutation,
    UpdateSkillMutationVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useMutation<UpdateSkillMutation, UpdateSkillMutationVariables>(
    UpdateSkillDocument,
    options,
  );
}

export const ImportSkillDocument = gql`
  mutation ImportSkill($data: ImportSkillInput!) {
    importSkill(data: $data) {
      ...Skill
    }
  }
  ${SkillFragmentDoc}
`;

export function useImportSkillMutation(
  baseOptions?: Apollo.MutationHookOptions<
    ImportSkillMutation,
    ImportSkillMutationVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useMutation<ImportSkillMutation, ImportSkillMutationVariables>(
    ImportSkillDocument,
    options,
  );
}

export const DeleteSkillDocument = gql`
  mutation DeleteSkill($where: SkillWhereInput!) {
    deleteSkill(where: $where)
  }
`;

export function useDeleteSkillMutation(
  baseOptions?: Apollo.MutationHookOptions<
    DeleteSkillMutation,
    DeleteSkillMutationVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useMutation<DeleteSkillMutation, DeleteSkillMutationVariables>(
    DeleteSkillDocument,
    options,
  );
}

export type AddSkillToUserMutationVariables = Types.Exact<{
  where: Types.SkillWhereInput;
}>;

export type AddSkillToUserMutation = {
  __typename?: 'Mutation';
  addSkillToUser: boolean;
};

export const AddSkillToUserDocument = gql`
  mutation AddSkillToUser($where: SkillWhereInput!) {
    addSkillToUser(where: $where)
  }
`;

export function useAddSkillToUserMutation(
  baseOptions?: Apollo.MutationHookOptions<
    AddSkillToUserMutation,
    AddSkillToUserMutationVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useMutation<
    AddSkillToUserMutation,
    AddSkillToUserMutationVariables
  >(AddSkillToUserDocument, options);
}

export type RemoveSkillFromUserMutationVariables = Types.Exact<{
  where: Types.SkillWhereInput;
}>;

export type RemoveSkillFromUserMutation = {
  __typename?: 'Mutation';
  removeSkillFromUser: boolean;
};

export const RemoveSkillFromUserDocument = gql`
  mutation RemoveSkillFromUser($where: SkillWhereInput!) {
    removeSkillFromUser(where: $where)
  }
`;

export function useRemoveSkillFromUserMutation(
  baseOptions?: Apollo.MutationHookOptions<
    RemoveSkillFromUserMutation,
    RemoveSkillFromUserMutationVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useMutation<
    RemoveSkillFromUserMutation,
    RemoveSkillFromUserMutationVariables
  >(RemoveSkillFromUserDocument, options);
}
