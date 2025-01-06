import React, { useMemo } from 'react';
import styled from 'styled-components';
import { NodeType, RelationshipType } from '../../types/graph';
import { getThemeColor, getContrastColor } from '../../styles/colors';
import Card from '../common/Card';

interface GraphLegendProps {
  visibleNodeTypes: NodeType[];
  visibleRelationshipTypes: RelationshipType[];
  onNodeTypeToggle: (type: NodeType) => void;
  onRelationshipTypeToggle: (type: RelationshipType) => void;
  className?: string;
  ariaLabel?: string;
}

const LegendContainer = styled.div`
  padding: 16px;
  max-width: 300px;
  max-height: 400px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: ${props => getThemeColor('scrollbar')};

  @media (max-width: 768px) {
    max-width: 100%;
  }
`;

const LegendSection = styled.div<{ titleId: string }>`
  margin-bottom: 16px;
  role: group;
  aria-labelledby: ${props => props.titleId};
`;

const LegendTitle = styled.h3`
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 8px;
  color: ${props => getThemeColor('text')};
  user-select: none;
`;

const LegendItem = styled.div<{ isVisible: boolean; color: string }>`
  display: flex;
  align-items: center;
  margin-bottom: 4px;
  cursor: pointer;
  opacity: ${props => props.isVisible ? 1 : 0.5};
  min-height: 48px;
  padding: 8px;
  border-radius: 4px;
  transition: background-color 0.2s;

  &:hover {
    background-color: ${props => getThemeColor('hover')};
  }

  &:focus-visible {
    outline: 2px solid ${props => getThemeColor('focus')};
  }
`;

const ColorIndicator = styled.div<{ color: string }>`
  width: 24px;
  height: 24px;
  border-radius: 12px;
  margin-right: 12px;
  background-color: ${props => props.color};
  border: 2px solid ${props => getThemeColor('surface')};
  flex-shrink: 0;
`;

const ItemLabel = styled.span`
  color: ${props => getThemeColor('text')};
  font-size: 14px;
  line-height: 20px;
`;

const formatLegendLabel = (value: string): string => {
  return useMemo(() => {
    return value
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ')
      .replace(/And/g, '&')
      .replace(/Of/g, 'of')
      .replace(/By/g, 'by');
  }, [value]);
};

const GraphLegend: React.FC<GraphLegendProps> = ({
  visibleNodeTypes,
  visibleRelationshipTypes,
  onNodeTypeToggle,
  onRelationshipTypeToggle,
  className,
  ariaLabel = 'Graph visualization legend'
}) => {
  const nodeColors = {
    [NodeType.ARTWORK]: '#1976D2',
    [NodeType.ARTIST]: '#9C27B0',
    [NodeType.MOVEMENT]: '#FF9800',
    [NodeType.TECHNIQUE]: '#4CAF50',
    [NodeType.PERIOD]: '#673AB7',
    [NodeType.LOCATION]: '#00BCD4',
    [NodeType.MATERIAL]: '#FF5722'
  };

  const relationshipColors = {
    [RelationshipType.CREATED_BY]: '#757575',
    [RelationshipType.BELONGS_TO]: '#9E9E9E',
    [RelationshipType.INFLUENCED_BY]: '#616161',
    [RelationshipType.LOCATED_IN]: '#424242',
    [RelationshipType.USES_TECHNIQUE]: '#BDBDBD',
    [RelationshipType.MADE_WITH]: '#E0E0E0',
    [RelationshipType.CONTEMPORARY_OF]: '#9E9E9E',
    [RelationshipType.STUDIED_UNDER]: '#757575'
  };

  return (
    <Card 
      elevation="low" 
      className={className}
      aria-label={ariaLabel}
      role="complementary"
    >
      <LegendContainer>
        <LegendSection titleId="node-types-title">
          <LegendTitle id="node-types-title">Node Types</LegendTitle>
          {Object.values(NodeType).map(nodeType => (
            <LegendItem
              key={nodeType}
              isVisible={visibleNodeTypes.includes(nodeType)}
              color={nodeColors[nodeType]}
              onClick={() => onNodeTypeToggle(nodeType)}
              role="checkbox"
              aria-checked={visibleNodeTypes.includes(nodeType)}
              tabIndex={0}
              onKeyPress={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  onNodeTypeToggle(nodeType);
                }
              }}
            >
              <ColorIndicator color={nodeColors[nodeType]} />
              <ItemLabel>{formatLegendLabel(nodeType)}</ItemLabel>
            </LegendItem>
          ))}
        </LegendSection>

        <LegendSection titleId="relationship-types-title">
          <LegendTitle id="relationship-types-title">Relationship Types</LegendTitle>
          {Object.values(RelationshipType).map(relType => (
            <LegendItem
              key={relType}
              isVisible={visibleRelationshipTypes.includes(relType)}
              color={relationshipColors[relType]}
              onClick={() => onRelationshipTypeToggle(relType)}
              role="checkbox"
              aria-checked={visibleRelationshipTypes.includes(relType)}
              tabIndex={0}
              onKeyPress={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  onRelationshipTypeToggle(relType);
                }
              }}
            >
              <ColorIndicator color={relationshipColors[relType]} />
              <ItemLabel>{formatLegendLabel(relType)}</ItemLabel>
            </LegendItem>
          ))}
        </LegendSection>
      </LegendContainer>
    </Card>
  );
};

export default React.memo(GraphLegend);