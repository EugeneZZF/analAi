import { useState } from 'react';
import Link from 'next/link';
import { Button, Card, Form, Input, Select, Typography, message } from 'antd';
import styled from 'styled-components';
import LockOutlined from '@ant-design/icons/LockOutlined';
import MailOutlined from '@ant-design/icons/MailOutlined';
import UserOutlined from '@ant-design/icons/UserOutlined';
import { AuthRole, useAuth } from '@/hooks/useAuth';
import { useTranslation } from '@/hooks/useI18n';

const { Title, Text } = Typography;

const AuthWrapper = styled.div`
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(circle at top, #1b1208 0%, #080909 55%);
  padding: 24px;
`;

const AuthCard = styled(Card)`
  width: 100%;
  max-width: 440px;
  background: #141414;
  border: 1px solid #262626;
  border-radius: 14px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.55);
`;

export default function RegisterPage() {
  const { register } = useAuth();
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);

  const onFinish = async (values: {
    name: string;
    email: string;
    password: string;
    role: AuthRole;
  }) => {
    setSubmitting(true);
    try {
      await register(values);
      message.success(t('auth.registerSuccess'));
    } catch (err: any) {
      message.error(err?.message || t('auth.registerError'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthWrapper>
      <AuthCard>
        <div className="mb-6 text-center">
          <Title level={3} style={{ color: '#FFFFFF', marginBottom: 4 }}>
            {t('auth.registerTitle')}
          </Title>
          <Text type="secondary">{t('auth.registerSubtitle')}</Text>
        </div>

        <Form
          layout="vertical"
          onFinish={onFinish}
          initialValues={{ role: 'user' }}
          requiredMark={false}
        >
          <Form.Item
            label={t('auth.name')}
            name="name"
            rules={[{ required: true, message: t('auth.nameRequired') }]}
          >
            <Input
              prefix={<UserOutlined style={{ color: '#8c8c8c' }} />}
              placeholder="Мирослав"
              size="large"
            />
          </Form.Item>

          <Form.Item
            label={t('auth.email')}
            name="email"
            rules={[
              { required: true, message: t('auth.emailRequired') },
              { type: 'email', message: t('auth.emailInvalid') },
            ]}
          >
            <Input
              prefix={<MailOutlined style={{ color: '#8c8c8c' }} />}
              placeholder="name@company.com"
              size="large"
            />
          </Form.Item>

          <Form.Item
            label={t('auth.password')}
            name="password"
            rules={[
              { required: true, message: t('auth.passwordRequired') },
              { min: 4, message: t('auth.passwordMin') },
            ]}
          >
            <Input.Password
              prefix={<LockOutlined style={{ color: '#8c8c8c' }} />}
              placeholder={t('auth.passwordMin')}
              size="large"
            />
          </Form.Item>

          <Form.Item
            label={t('auth.roleMvp')}
            name="role"
            rules={[{ required: true, message: t('auth.roleRequired') }]}
          >
            <Select size="large">
              <Select.Option value="user">{t('auth.roleUser')}</Select.Option>
              <Select.Option value="admin">{t('auth.roleAdmin')}</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item className="mb-3">
            <Button
              type="primary"
              htmlType="submit"
              size="large"
              block
              loading={submitting}
              style={{
                background: '#FF8500',
                borderColor: '#FF8500',
                color: '#080909',
                fontWeight: 600,
              }}
            >
              {t('auth.createAccount')}
            </Button>
          </Form.Item>
        </Form>

        <div className="text-center mt-4">
          <Text type="secondary">{t('auth.haveAccount')} </Text>
          <Link href="/login" style={{ color: '#FF8500', fontWeight: 500 }}>
            {t('auth.signIn')}
          </Link>
        </div>
      </AuthCard>
    </AuthWrapper>
  );
}
