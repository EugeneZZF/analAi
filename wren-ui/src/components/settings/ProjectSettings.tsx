import { useState } from 'react';
import { Button, Modal, Select, Row, Col, Form, Divider, message } from 'antd';
import { useRouter } from 'next/router';
import { Path } from '@/utils/enum';
import {
  useResetCurrentProjectMutation,
  useUpdateCurrentProjectMutation,
} from '@/apollo/client/graphql/settings.generated';
import { getLanguageText } from '@/utils/language';
import { ProjectLanguage } from '@/apollo/client/graphql/__types__';
import { useAuth } from '@/hooks/useAuth';
import { LocaleCode, useTranslation } from '@/hooks/useI18n';

interface Props {
  data: { language: string };
}

export default function ProjectSettings(props: Props) {
  const { data } = props;
  const router = useRouter();
  const [form] = Form.useForm();
  const { updateLanguage } = useAuth();
  const { locale, t } = useTranslation();
  const [savingUiLang, setSavingUiLang] = useState(false);

  const [resetCurrentProject, { client }] = useResetCurrentProjectMutation({
    onError: (error) => console.error(error),
  });
  const languageOptions = Object.keys(ProjectLanguage).map((key) => {
    return { label: getLanguageText(key as ProjectLanguage), value: key };
  });

  const [updateCurrentProject, { loading }] = useUpdateCurrentProjectMutation({
    refetchQueries: ['GetSettings'],
    onError: (error) => console.error(error),
    onCompleted: () => {
      message.success(t('settings.projectLanguageUpdated'));
    },
  });

  const handleInterfaceLanguageChange = async (nextLocale: LocaleCode) => {
    setSavingUiLang(true);
    try {
      await updateLanguage(nextLocale);
      message.success(t('settings.languageUpdated'));
    } catch (err) {
      console.error(err);
      message.error(t('settings.languageUpdateError'));
    } finally {
      setSavingUiLang(false);
    }
  };

  const reset = () => {
    Modal.confirm({
      title: t('settings.resetConfirmTitle'),
      okButtonProps: { danger: true },
      okText: t('common.reset'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        await resetCurrentProject();
        client.clearStore();
        router.push(Path.OnboardingConnection);
      },
    });
  };

  const submit = () => {
    form
      .validateFields()
      .then((values) => {
        updateCurrentProject({ variables: { data: values } });
      })
      .catch((error) => console.error(error));
  };

  return (
    <div className="py-3 px-4">
      <Form layout="vertical">
        <Form.Item
          label={t('settings.interfaceLanguage')}
          extra={t('settings.interfaceLanguageExtra')}
        >
          <Select
            value={locale}
            loading={savingUiLang}
            onChange={handleInterfaceLanguageChange}
            options={[
              { label: t('settings.languageRu'), value: 'ru' },
              { label: t('settings.languageEn'), value: 'en' },
            ]}
          />
        </Form.Item>
      </Form>

      <Divider className="my-4" />

      <Form
        form={form}
        layout="vertical"
        initialValues={{ language: data.language }}
      >
        <Form.Item
          label={t('settings.projectLanguage')}
          extra={t('settings.projectLanguageExtra')}
        >
          <Row gutter={16} wrap={false}>
            <Col className="flex-grow-1">
              <Form.Item name="language" noStyle>
                <Select
                  placeholder={t('settings.projectLanguage')}
                  showSearch
                  options={languageOptions}
                />
              </Form.Item>
            </Col>
            <Col>
              <Button
                type="primary"
                style={{ width: 100 }}
                onClick={submit}
                loading={loading}
              >
                {t('common.save')}
              </Button>
            </Col>
          </Row>
        </Form.Item>
      </Form>
      <div className="gray-8 mb-2">{t('settings.resetProject')}</div>
      <Button type="primary" style={{ width: 100 }} danger onClick={reset}>
        {t('common.reset')}
      </Button>
      <div className="gray-6 mt-1">{t('settings.resetWarning')}</div>
    </div>
  );
}
