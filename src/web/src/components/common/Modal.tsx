import React, { useEffect, useCallback } from 'react';
import styled, { css } from 'styled-components'; // v5.3.0
import FocusTrap from 'focus-trap-react'; // v9.0.0
import { fadeIn, fadeOut, slideIn, slideOut } from '../../styles/animations';
import { theme } from '../../styles/theme';
import Button from './Button';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  size?: 'small' | 'medium' | 'large';
  closeOnOverlayClick?: boolean;
  className?: string;
  initialFocusRef?: React.RefObject<HTMLElement>;
  returnFocusRef?: React.RefObject<HTMLElement>;
  ariaDescribedBy?: string;
  disableAnimation?: boolean;
  preventScroll?: boolean;
  modalId?: string;
}

const ModalOverlay = styled.div<{ isOpen: boolean; disableAnimation?: boolean }>`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: ${({ theme }) => theme.colors.getColor('overlay', 0.6)};
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  opacity: 0;
  visibility: hidden;
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  will-change: opacity;
  
  ${({ isOpen, disableAnimation }) => isOpen && css`
    opacity: 1;
    visibility: visible;
    animation: ${disableAnimation ? 'none' : css`${fadeIn} 200ms ${theme.transitions.timing}`};

    @media (prefers-reduced-motion: reduce) {
      animation: none;
    }
  `}

  ${({ isOpen, disableAnimation }) => !isOpen && css`
    animation: ${disableAnimation ? 'none' : css`${fadeOut} 200ms ${theme.transitions.timing}`};

    @media (prefers-reduced-motion: reduce) {
      animation: none;
    }
  `}
`;

const ModalContainer = styled.div<{ 
  size?: ModalProps['size']; 
  isOpen: boolean;
  disableAnimation?: boolean;
}>`
  background-color: ${({ theme }) => theme.colors.getColor('surface')};
  border-radius: ${({ theme }) => theme.typography.platform.ios ? '12px' : '8px'};
  box-shadow: 0 8px 32px ${({ theme }) => theme.colors.getColor('overlay', 0.16)};
  max-height: 90vh;
  overflow-y: auto;
  position: relative;
  opacity: 0;
  transform: translateY(20px);
  will-change: transform, opacity;

  ${({ size }) => {
    const sizes = {
      small: '320px',
      medium: '480px',
      large: '640px'
    };
    return css`
      width: min(${sizes[size || 'medium']}, 90vw);
    `;
  }}

  ${({ isOpen, disableAnimation }) => isOpen && css`
    opacity: 1;
    transform: translateY(0);
    animation: ${disableAnimation ? 'none' : css`${slideIn} 250ms ${theme.transitions.timing}`};

    @media (prefers-reduced-motion: reduce) {
      animation: none;
    }
  `}

  ${({ isOpen, disableAnimation }) => !isOpen && css`
    animation: ${disableAnimation ? 'none' : css`${slideOut} 200ms ${theme.transitions.timing}`};

    @media (prefers-reduced-motion: reduce) {
      animation: none;
    }
  `}

  &:focus {
    outline: none;
  }

  @supports (overflow: overlay) {
    overflow-y: overlay;
  }
`;

const ModalHeader = styled.header`
  padding: ${theme.spacing.margin}px ${theme.spacing.padding}px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.getColor('divider')};
`;

const ModalTitle = styled.h2`
  ${theme.typography.heading2};
  color: ${({ theme }) => theme.colors.getColor('text')};
  margin: 0;
`;

const ModalContent = styled.div`
  padding: ${theme.spacing.padding}px;
  color: ${({ theme }) => theme.colors.getColor('text')};
`;

const ModalFooter = styled.footer`
  padding: ${theme.spacing.padding}px;
  border-top: 1px solid ${({ theme }) => theme.colors.getColor('divider')};
  display: flex;
  justify-content: flex-end;
  gap: ${theme.spacing.gap}px;
`;

const CloseButton = styled(Button)`
  position: absolute;
  top: ${theme.spacing.padding / 2}px;
  right: ${theme.spacing.padding / 2}px;
`;

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  actions,
  size = 'medium',
  closeOnOverlayClick = true,
  className,
  initialFocusRef,
  returnFocusRef,
  ariaDescribedBy,
  disableAnimation = false,
  preventScroll = true,
  modalId,
}) => {
  const handleEscapeKey = useCallback((event: KeyboardEvent) => {
    if (event.key === 'Escape' && isOpen) {
      event.preventDefault();
      onClose();
    }
  }, [isOpen, onClose]);

  const handleOverlayClick = useCallback((event: React.MouseEvent) => {
    if (event.target === event.currentTarget && closeOnOverlayClick) {
      onClose();
    }
  }, [closeOnOverlayClick, onClose]);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleEscapeKey);
      if (preventScroll) {
        document.body.style.overflow = 'hidden';
      }
    }

    return () => {
      document.removeEventListener('keydown', handleEscapeKey);
      if (preventScroll) {
        document.body.style.overflow = '';
      }
    };
  }, [isOpen, handleEscapeKey, preventScroll]);

  if (!isOpen) return null;

  return (
    <FocusTrap
      focusTrapOptions={{
        initialFocus: initialFocusRef?.current || undefined,
        returnFocus: returnFocusRef?.current || undefined,
        escapeDeactivates: true,
        allowOutsideClick: true,
      }}
    >
      <ModalOverlay
        isOpen={isOpen}
        onClick={handleOverlayClick}
        disableAnimation={disableAnimation}
        aria-hidden="true"
      >
        <ModalContainer
          role="dialog"
          aria-modal="true"
          aria-labelledby={`${modalId || 'modal'}-title`}
          aria-describedby={ariaDescribedBy}
          size={size}
          isOpen={isOpen}
          disableAnimation={disableAnimation}
          className={className}
          tabIndex={-1}
        >
          <ModalHeader>
            <ModalTitle id={`${modalId || 'modal'}-title`}>
              {title}
            </ModalTitle>
            <CloseButton
              variant="text"
              size="small"
              onClick={onClose}
              aria-label="Close modal"
              icon={<span aria-hidden="true">&times;</span>}
            />
          </ModalHeader>
          <ModalContent>
            {children}
          </ModalContent>
          {actions && (
            <ModalFooter>
              {actions}
            </ModalFooter>
          )}
        </ModalContainer>
      </ModalOverlay>
    </FocusTrap>
  );
};

export default Modal;