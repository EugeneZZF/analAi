import { useState } from 'react';
import Link from 'next/link';
import { Button, Card, Form, Input, Typography, message } from 'antd';
import styled from 'styled-components';
import LockOutlined from '@ant-design/icons/LockOutlined';
import MailOutlined from '@ant-design/icons/MailOutlined';
import { useAuth } from '@/hooks/useAuth';
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
  max-width: 420px;
  background: #141414;
  border: 1px solid #262626;
  border-radius: 14px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.55);
`;

export default function LoginPage() {
  const { login } = useAuth();
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);

  const onFinish = async (values: { email: string; password: string }) => {
    setSubmitting(true);
    try {
      await login(values.email, values.password);
      message.success(t('auth.loginSuccess'));
    } catch (err: any) {
      message.error(err?.message || t('auth.loginError'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthWrapper>
      <AuthCard>
        <div className="mb-6 text-center">
          <Title level={3} style={{ color: '#FFFFFF', marginBottom: 4 }}>
            Аналитик <span style={{ color: '#FF8500' }}>AI</span>
          </Title>
          <Text type="secondary">{t('auth.loginTitle')}</Text>
        </div>

        <Form layout="vertical" onFinish={onFinish} requiredMark={false}>
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
            rules={[{ required: true, message: t('auth.passwordRequired') }]}
          >
            <Input.Password
              prefix={<LockOutlined style={{ color: '#8c8c8c' }} />}
              placeholder="••••••••"
              size="large"
            />
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
              {t('auth.signIn')}
            </Button>
          </Form.Item>
        </Form>

        <div className="text-center mt-4">
          <Text type="secondary">{t('auth.noAccount')} </Text>
          <Link href="/register" style={{ color: '#FF8500', fontWeight: 500 }}>
            {t('common.register')}
          </Link>
        </div>
      </AuthCard>
    </AuthWrapper>
  );
}
