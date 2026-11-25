import styled from 'styled-components';

const Brand = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  user-select: none;
`;

const StarBadge = styled.span`
  width: 24px;
  height: 24px;
  border-radius: 7px;
  background: rgba(255, 133, 0, 0.14);
  border: 1px solid rgba(255, 133, 0, 0.35);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #ff8500;
`;

const BrandName = styled.span`
  font-weight: 700;
  font-size: 15px;
  color: #f5f5f5;
  letter-spacing: -0.01em;
`;

const BetaPill = styled.span`
  font-size: 10px;
  font-weight: 600;
  color: #ff8500;
  background: rgba(255, 133, 0, 0.14);
  border: 1px solid rgba(255, 133, 0, 0.35);
  border-radius: 6px;
  padding: 1px 6px;
  line-height: 14px;
`;

export default function LogoBar() {
  return (
    <Brand>
      <StarBadge>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2L14.8 9.2L22 12L14.8 14.8L12 22L9.2 14.8L2 12L9.2 9.2L12 2Z" />
        </svg>
      </StarBadge>
      <BrandName>Аналитик AI</BrandName>
      <BetaPill>Beta</BetaPill>
    </Brand>
  );
}
