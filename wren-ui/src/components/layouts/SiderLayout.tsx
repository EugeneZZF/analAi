import { Alert, Layout, Typography } from 'antd';
import LockOutlined from '@ant-design/icons/LockOutlined';
import styled, { css } from 'styled-components';
import SimpleLayout from '@/components/layouts/SimpleLayout';
import Sidebar from '@/components/sidebar';
import Settings from '@/components/settings';
import useModalAction from '@/hooks/useModalAction';
import { useAuth } from '@/hooks/useAuth';
import { useTranslation } from '@/hooks/useI18n';

const { Sider } = Layout;

const basicStyle = css`
  height: calc(100vh - 48px);
  overflow: auto;
`;

const StyledContentLayout = styled(Layout)<{ color?: string }>`
  position: relative;
  ${basicStyle}
  background-color: ${(props) =>
    props.color ? `var(--${props.color})` : 'var(--bg-base, #080909)'};
`;

const StyledSider = styled(Sider)`
  ${basicStyle}
  background-color: var(--bg-card, #141414);
  border-right: 1px solid var(--gray-4);
`;

type Props = React.ComponentProps<typeof SimpleLayout> & {
  sidebar?: React.ComponentProps<typeof Sidebar>;
  color?: string;
};

export default function SiderLayout(props: Props) {
  const { sidebar, loading, color } = props;
  const settings = useModalAction();
  const { forbiddenMessage } = useAuth();
  const { t } = useTranslation();

  return (
    <SimpleLayout loading={loading}>
      <Layout className="adm-layout">
        <StyledSider width={280}>
          <Sidebar {...sidebar} onOpenSettings={settings.openModal} />
        </StyledSider>
        <StyledContentLayout color={color}>
          {forbiddenMessage ? (
            <div className="d-flex align-center justify-center" style={{ minHeight: '70vh', padding: 24 }}>
              <div
                style={{
                  maxWidth: 520,
                  width: '100%',
                  padding: 28,
                  borderRadius: 12,
                  background: '#141414',
                  border: '1px solid #2a2a2a',
                  textAlign: 'center',
                }}
              >
                <LockOutlined
                  style={{ fontSize: 40, color: '#FF8500', marginBottom: 16 }}
                />
                <Typography.Title level={4} style={{ color: '#FFFFFF', marginBottom: 12 }}>
                  {t('errors.forbiddenTitle')}
                </Typography.Title>
                <Alert
                  type="error"
                  showIcon
                  message={forbiddenMessage || t('errors.forbiddenData')}
                />
              </div>
            </div>
          ) : (
            props.children
          )}
        </StyledContentLayout>
      </Layout>
      <Settings {...settings.state} onClose={settings.closeModal} />
    </SimpleLayout>
  );
}
