import {
  useEffect,
  useMemo,
  useState,
  forwardRef,
  useImperativeHandle,
} from 'react';
import Link from 'next/link';
import styled from 'styled-components';
import { Select, Tag, Tooltip } from 'antd';
import ThunderboltOutlined from '@ant-design/icons/ThunderboltOutlined';
import SettingOutlined from '@ant-design/icons/SettingOutlined';
import { Path, PROCESS_STATE } from '@/utils/enum';
import { useTranslation } from '@/hooks/useI18n';
import PromptInput from '@/components/pages/home/prompt/Input';
import PromptResult from '@/components/pages/home/prompt/Result';
import useAskProcessState, {
  getIsProcessing,
} from '@/hooks/useAskProcessState';
import { AskPromptData } from '@/hooks/useAskPrompt';
import { SkillFragment } from '@/apollo/client/graphql/skills.generated';
import {
  CreateThreadInput,
  CreateThreadResponseInput,
} from '@/apollo/client/graphql/__types__';

interface Props {
  onCreateResponse: (
    payload: CreateThreadInput | CreateThreadResponseInput,
  ) => Promise<void>;
  onStop: () => void;
  onSubmit: (value: string) => Promise<void>;
  onStopPolling: () => void;
  onStopStreaming: () => void;
  onStopRecommend: () => void;
  data: AskPromptData;
  loading: boolean;
  availableSkills?: SkillFragment[];
  selectedSkillIds?: string[];
  onChangeSelectedSkills?: (ids: string[]) => void;
  inputProps: {
    placeholder: string;
  };
}

interface Attributes {
  submit: (value: string) => void;
  close: () => void;
}

const PromptStyle = styled.div`
  position: fixed;
  width: 680px;
  left: 50%;
  margin-left: calc(-340px + 133px);
  bottom: 18px;
  z-index: 999;
  box-shadow:
    rgba(0, 0, 0, 0.1) 0px 10px 15px -3px,
    rgba(0, 0, 0, 0.05) 0px 4px 6px -2px;
`;

export default forwardRef<Attributes, Props>(function Prompt(props, ref) {
  const { t } = useTranslation();
  const {
    data,
    loading,
    onSubmit,
    onStop,
    onCreateResponse,
    onStopStreaming,
    onStopRecommend,
    availableSkills = [],
    selectedSkillIds = [],
    onChangeSelectedSkills,
    inputProps,
  } = props;
  const askProcessState = useAskProcessState();

  const {
    originalQuestion,
    askingTask,
    askingStreamTask,
    recommendedQuestions,
  } = data;

  const result = useMemo(
    () => ({
      type: askingTask?.type, // question's type
      originalQuestion, // original question
      askingStreamTask, // for general answer
      recommendedQuestions, // guiding user to ask
      intentReasoning: askingTask?.intentReasoning || '',
    }),
    [data],
  );
  const error = useMemo(() => askingTask?.error || null, [askingTask?.error]);
  const [showResult, setShowResult] = useState(false);
  const [question, setQuestion] = useState('');
  const currentProcessState = useMemo(
    () => askProcessState.currentState,
    [askProcessState.currentState],
  );
  const isProcessing = useMemo(
    () => getIsProcessing(currentProcessState),
    [currentProcessState],
  );

  useEffect(() => {
    if (askingTask) {
      const processState = askProcessState.matchedState(askingTask);
      askProcessState.transitionTo(processState);
    }
  }, [askingTask]);

  useEffect(() => {
    if (error) {
      !askProcessState.isFailed() &&
        askProcessState.transitionTo(PROCESS_STATE.FAILED);
    }
  }, [error]);

  // create thread response for recommended question
  const selectRecommendedQuestion = async (payload: {
    question: string;
    sql: string;
  }) => {
    onCreateResponse && (await onCreateResponse(payload));
    closeResult();
  };

  // create thread response for text to sql
  const intentSQLAnswer = async () => {
    onCreateResponse &&
      (await onCreateResponse({ question, taskId: askingTask?.queryId }));
    setShowResult(false);
  };

  const closeResult = () => {
    askProcessState.resetState();
    setQuestion('');
    onStopStreaming && onStopStreaming();
    onStopRecommend && onStopRecommend();
  };

  const stopProcess = async () => {
    onStop && (await onStop());
    setShowResult(false);
    askProcessState.resetState();
  };

  const submitAsk = async (value: string) => {
    setQuestion(value);
    if (isProcessing || !value) return;
    // start the state as understanding when user submit question
    askProcessState.transitionTo(PROCESS_STATE.UNDERSTANDING);
    setShowResult(true);
    onSubmit && (await onSubmit(value));
  };

  useImperativeHandle(
    ref,
    () => ({
      submit: submitAsk,
      close: closeResult,
    }),
    [question, isProcessing, setQuestion],
  );

  return (
    <PromptStyle className="bg-gray-2 p-3 border border-gray-3 rounded">
      <div className="d-flex align-center justify-space-between mb-2">
        <div className="d-flex align-center flex-grow-1 mr-2" style={{ gap: 6 }}>
          <Tooltip title="Агент автоматически подбирает скиллы по контексту вопроса. Вы также можете явно выбрать скиллы здесь:">
            <span className="text-xs gray-7 d-flex align-center" style={{ whiteSpace: 'nowrap' }}>
              <ThunderboltOutlined className="geekblue-6 mr-1" />
              {t('prompt.skillsSelectorLabel')}
            </span>
          </Tooltip>
          <Select
            mode="multiple"
            size="small"
            allowClear
            maxTagCount="responsive"
            style={{ flex: 1, minWidth: 200 }}
            placeholder={t('prompt.skillsAutoPlaceholder')}
            value={selectedSkillIds}
            onChange={(vals) => onChangeSelectedSkills?.(vals)}
            disabled={isProcessing}
            optionLabelProp="label"
          >
            {availableSkills.map((skill) => (
              <Select.Option
                key={skill.slug}
                value={skill.slug}
                label={skill.name}
              >
                <div className="d-flex align-center justify-space-between">
                  <span>{skill.name}</span>
                  <span>
                    {skill.isGlobal && (
                      <Tag color="green" className="text-xs mr-0">
                        Global
                      </Tag>
                    )}
                    <Tag className="text-xs ml-1 mr-0">@{skill.slug}</Tag>
                  </span>
                </div>
              </Select.Option>
            ))}
          </Select>
        </div>
        <Link
          href={Path.SkillsLibrary}
          className="text-xs geekblue-6 d-flex align-center"
          style={{ whiteSpace: 'nowrap' }}
        >
          <SettingOutlined className="mr-1" />
          {t('prompt.libraryLink', { count: availableSkills.length })}
        </Link>
      </div>
      <div className="d-flex align-end">
        <PromptInput
          question={question}
          isProcessing={isProcessing}
          onAsk={submitAsk}
          inputProps={inputProps}
        />
      </div>

      {showResult && (
        <PromptResult
          data={result}
          error={error}
          loading={loading}
          processState={currentProcessState}
          onSelectRecommendedQuestion={selectRecommendedQuestion}
          onIntentSQLAnswer={intentSQLAnswer}
          onClose={closeResult}
          onStop={stopProcess}
        />
      )}
    </PromptStyle>
  );
});
