import React, { useState, useCallback, useEffect } from 'react';
import styled from 'styled-components';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { useAuth } from '../../hooks/useAuth';
import { EMAIL_REGEX } from '../../types/user';

// Rate limiting constants
const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes
const ATTEMPT_RESET_DURATION = 60 * 60 * 1000; // 1 hour

interface ForgotPasswordFormState {
  email: string;
  error: string | null;
  isSubmitting: boolean;
  isSuccess: boolean;
  attemptCount: number;
  lastAttemptTime: number;
  deviceFingerprint: string;
}

const Container = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: ${({ theme }) => theme.spacing.LARGE}px;
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
  background-color: ${({ theme }) => theme.colors.getColor('background')};

  @media (max-width: ${({ theme }) => theme.SCREEN_SIZES.SMALL_PHONE}px) {
    padding: ${({ theme }) => theme.spacing.MEDIUM}px;
  }
`;

const Form = styled.form`
  width: 100%;
  max-width: 400px;
  ${({ theme }) => theme.spacing.margin('large', 'bottom')}
`;

const Title = styled.h1`
  ${({ theme }) => theme.typography.heading1}
  color: ${({ theme }) => theme.colors.getColor('text')};
  text-align: center;
  margin-bottom: ${({ theme }) => theme.spacing.LARGE}px;
`;

const Description = styled.p`
  ${({ theme }) => theme.typography.bodyText}
  color: ${({ theme }) => theme.colors.getColor('textSecondary')};
  text-align: center;
  margin-bottom: ${({ theme }) => theme.spacing.EXTRA_LARGE}px;
`;

const SuccessMessage = styled.div`
  ${({ theme }) => theme.typography.bodyText}
  color: ${({ theme }) => theme.colors.getColor('success')};
  text-align: center;
  padding: ${({ theme }) => theme.spacing.MEDIUM}px;
  border-radius: 8px;
  background-color: ${({ theme }) => theme.colors.getColor('success', 0.1)};
  margin-bottom: ${({ theme }) => theme.spacing.LARGE}px;
`;

const BackToLogin = styled.button`
  ${({ theme }) => theme.typography.bodyText}
  color: ${({ theme }) => theme.colors.getColor('primary')};
  background: none;
  border: none;
  cursor: pointer;
  padding: ${({ theme }) => theme.spacing.SMALL}px;
  margin-top: ${({ theme }) => theme.spacing.MEDIUM}px;

  &:focus-visible {
    ${({ theme }) => theme.accessibility.focusRing}
  }
`;

export const ForgotPasswordScreen: React.FC = () => {
  const navigate = useNavigate();
  const { isLoading } = useAuth();
  const [formState, setFormState] = useState<ForgotPasswordFormState>({
    email: '',
    error: null,
    isSubmitting: false,
    isSuccess: false,
    attemptCount: 0,
    lastAttemptTime: 0,
    deviceFingerprint: '',
  });

  // Generate device fingerprint on mount
  useEffect(() => {
    const generateFingerprint = async () => {
      const fingerprint = await fetch('/api/auth/fingerprint').then(res => res.text());
      setFormState(prev => ({ ...prev, deviceFingerprint: fingerprint }));
    };
    generateFingerprint();
  }, []);

  const handleEmailChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setFormState(prev => ({
      ...prev,
      email: event.target.value,
      error: null,
    }));
  }, []);

  const handleSubmit = useCallback(async (event: React.FormEvent) => {
    event.preventDefault();

    // Rate limiting check
    const now = Date.now();
    if (
      formState.attemptCount >= MAX_ATTEMPTS &&
      now - formState.lastAttemptTime < LOCKOUT_DURATION
    ) {
      const remainingTime = Math.ceil(
        (LOCKOUT_DURATION - (now - formState.lastAttemptTime)) / 1000 / 60
      );
      setFormState(prev => ({
        ...prev,
        error: `Too many attempts. Please try again in ${remainingTime} minutes.`,
      }));
      return;
    }

    // Reset attempt count if enough time has passed
    if (now - formState.lastAttemptTime > ATTEMPT_RESET_DURATION) {
      setFormState(prev => ({ ...prev, attemptCount: 0 }));
    }

    // Validate email
    if (!EMAIL_REGEX.test(formState.email)) {
      setFormState(prev => ({
        ...prev,
        error: 'Please enter a valid email address.',
      }));
      return;
    }

    setFormState(prev => ({
      ...prev,
      isSubmitting: true,
      error: null,
    }));

    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Device-Fingerprint': formState.deviceFingerprint,
        },
        body: JSON.stringify({ email: formState.email }),
      });

      if (!response.ok) {
        throw new Error('Password reset request failed');
      }

      setFormState(prev => ({
        ...prev,
        isSubmitting: false,
        isSuccess: true,
        attemptCount: prev.attemptCount + 1,
        lastAttemptTime: Date.now(),
      }));
    } catch (error) {
      setFormState(prev => ({
        ...prev,
        isSubmitting: false,
        error: 'Failed to send password reset email. Please try again.',
        attemptCount: prev.attemptCount + 1,
        lastAttemptTime: Date.now(),
      }));
    }
  }, [formState.email, formState.attemptCount, formState.lastAttemptTime, formState.deviceFingerprint]);

  return (
    <Container>
      <Form onSubmit={handleSubmit} noValidate>
        <Title>Reset Password</Title>
        <Description>
          Enter your email address and we'll send you instructions to reset your password.
        </Description>

        {formState.isSuccess ? (
          <SuccessMessage role="alert">
            Password reset instructions have been sent to your email address.
          </SuccessMessage>
        ) : (
          <Input
            type="email"
            name="email"
            label="Email Address"
            value={formState.email}
            onChange={handleEmailChange}
            error={!!formState.error}
            errorMessage={formState.error}
            disabled={formState.isSubmitting || isLoading}
            required
            autoComplete="email"
            inputMode="email"
            pattern={EMAIL_REGEX.source}
            aria-label="Email Address"
            aria-required="true"
            aria-invalid={!!formState.error}
          />
        )}

        <Button
          type="submit"
          variant="primary"
          fullWidth
          disabled={formState.isSubmitting || isLoading || formState.isSuccess}
          loading={formState.isSubmitting}
          aria-label="Reset Password"
        >
          {formState.isSubmitting ? 'Sending...' : 'Reset Password'}
        </Button>

        <BackToLogin
          type="button"
          onClick={() => navigate('/login')}
          aria-label="Back to Login"
        >
          Back to Login
        </BackToLogin>
      </Form>
    </Container>
  );
};

export default ForgotPasswordScreen;