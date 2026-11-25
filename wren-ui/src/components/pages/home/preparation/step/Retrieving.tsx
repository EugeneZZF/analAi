import { Typography, Tag } from 'antd';
import ThunderboltOutlined from '@ant-design/icons/ThunderboltOutlined';
import { makeIterable } from '@/utils/iteration';
import { Spinner } from '@/components/PageLoading';
import { useTranslation } from '@/hooks/useI18n';

interface Props {
  tables: string[];
  appliedSkills?: string[];
  loading?: boolean;
  isAdjustment?: boolean;
}

const TagTemplate = ({ name }: { name: string }) => {
  return <Tag className="gray-7 mb-2">{name}</Tag>;
};

const TagIterator = makeIterable(TagTemplate);

export default function Retrieving(props: Props) {
  const { tables, appliedSkills = [], loading, isAdjustment } = props;
  const { t } = useTranslation();

  const data = tables.map((table) => ({ name: table }));

  const title = isAdjustment
    ? t('preparation.retrievingAdjusted')
    : t('preparation.retrievingTitle');

  const modelDescription = isAdjustment ? (
    <>{t('preparation.modelsApplied', { count: tables.length })}</>
  ) : (
    <>{t('preparation.candidatesIdentified', { count: tables.length })}</>
  );

  return (
    <>
      <Typography.Text className="gray-8">{title}</Typography.Text>
      <div className="gray-7 text-sm mt-1">
        {loading ? (
          <div className="d-flex align-center gx-2">
            {t('preparation.searching')}
            <Spinner className="gray-6" size={12} />
          </div>
        ) : (
          <>
            <div className="mb-1">{modelDescription}</div>
            <TagIterator data={data} />
            {appliedSkills.length > 0 && (
              <div className="mt-2">
                <div className="mb-1">
                  {t('preparation.activeSkillsApplied', {
                    count: appliedSkills.length,
                  })}
                </div>
                {appliedSkills.map((skillName) => (
                  <Tag key={skillName} color="geekblue" className="mb-1">
                    <ThunderboltOutlined className="mr-1" />
                    {skillName}
                  </Tag>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
