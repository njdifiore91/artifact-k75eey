import React, { useState, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import styled, { css } from 'styled-components';
import * as yup from 'yup';
import { ErrorBoundary } from 'react-error-boundary';

import { useAuth } from '../../hooks/useAuth';
import Button from '../../components/common/Button';
import Input from '../../components/common/Input';
import { EMAIL_REGEX, PASSWORD_REGEX } from '../../types/user';

// Validation schema for login form
const loginSchema = yup.object().shape({
  email: yup.string()
    .required('Email is required')
    .matches(EMAIL_REGEX, 'Please enter a valid email address'),
  password: yup.string()
    .required('Password is required')
    .matches(PASSWORD_REGEX, 'Password must be at least 12 characters and include uppercase, lowercase, number, and special character')
});

// Styled components with platform-specific adaptations
const Container = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  width: 100%;
  padding: ${({ theme }) => theme.spacing.LARGE}px;
  background-color: ${({ theme }) => theme.colors.getColor('background')};
  
  @supports (padding: max(0px)) {
    padding-top: max(${({ theme }) => theme.spacing.LARGE}px, env(safe-area-inset-top));
    padding-bottom: max(${({ theme }) => theme.spacing.LARGE}px, env(safe-area-inset-bottom));
  }
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 400px;
  ${({ theme }) => theme.spacing.gap('medium')}
  padding: ${({ theme }) => theme.spacing.LARGE}px;
  background-color: ${({ theme }) => theme.colors.getColor('surface')};
  border-radius: ${({ theme }) => theme.platform === 'ios' ? '12px' : '8px'};
  box-shadow: 0 2px 8px ${({ theme }) => theme.colors.getColor('overlay')};
  
  ${({ theme }) => theme.transitions.create(['transform', 'box-shadow'])}
  
  @media (prefers-reduced-motion: no-preference) {
    &:focus-within {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px ${({ theme }) => theme.colors.getColor('overlay')};
    }
  }
`;

const Title = styled.h1`
  ${({ theme }) => theme.typography.heading1}
  color: ${({ theme }) => theme.colors.getColor('text')};
  margin-bottom: ${({ theme }) => theme.spacing.MEDIUM}px;
  text-align: center;
`;

const Divider = styled.div`
  width: 100%;
  height: 1px;
  background-color: ${({ theme }) => theme.colors.getColor('divider')};
  margin: ${({ theme }) => theme.spacing.MEDIUM}px 0;
`;

const ErrorMessage = styled.div`
  ${({ theme }) => theme.typography.caption}
  color: ${({ theme }) => theme.colors.getColor('error')};
  text-align: center;
  padding: ${({ theme }) => theme.spacing.SMALL}px;
  background-color: ${({ theme }) => theme.colors.getColor('error', 0.1)};
  border-radius: 4px;
  margin-bottom: ${({ theme }) => theme.spacing.MEDIUM}px;
`;

interface FormData {
  email: string;
  password: string;
}

export const LoginScreen: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, socialLogin, isAuthenticated, isLoading } = useAuth();
  
  const [formData, setFormData] = useState<FormData>({ email: '', password: '' });
  const [errors, setErrors] = useState<Partial<FormData>>({});
  const [generalError, setGeneralError] = useState<string>('');
  const [socialLoading, setSocialLoading] = useState<Record<string, boolean>>({});

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setErrors(prev => ({ ...prev, [name]: '' }));
    setGeneralError('');
  }, []);

  const validateForm = useCallback(async () => {
    try {
      await loginSchema.validate(formData, { abortEarly: false });
      return true;
    } catch (err) {
      if (err instanceof yup.ValidationError) {
        const validationErrors: Partial<FormData> = {};
        err.inner.forEach(error => {
          if (error.path) {
            validationErrors[error.path as keyof FormData] = error.message;
          }
        });
        setErrors(validationErrors);
      }
      return false;
    }
  }, [formData]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (await validateForm()) {
      try {
        const result = await login({
          email: formData.email,
          password: formData.password
        });

        if (result.success) {
          const redirectTo = location.state?.from?.pathname || '/';
          navigate(redirectTo, { replace: true });
        } else if (result.requiresMfa) {
          navigate('/mfa', { state: { email: formData.email } });
        }
      } catch (error) {
        setGeneralError(error instanceof Error ? error.message : 'Login failed. Please try again.');
      }
    }
  }, [formData, login, navigate, location.state, validateForm]);

  const handleSocialLogin = useCallback(async (provider: string) => {
    setSocialLoading(prev => ({ ...prev, [provider]: true }));
    try {
      await socialLogin(provider);
      navigate(location.state?.from?.pathname || '/');
    } catch (error) {
      setGeneralError('Social login failed. Please try again.');
    } finally {
      setSocialLoading(prev => ({ ...prev, [provider]: false }));
    }
  }, [socialLogin, navigate, location.state]);

  if (isAuthenticated) {
    navigate('/');
    return null;
  }

  return (
    <ErrorBoundary fallback={<div>Something went wrong</div>}>
      <Container>
        <Form onSubmit={handleSubmit} noValidate>
          <Title>Sign In</Title>
          
          {generalError && <ErrorMessage role="alert">{generalError}</ErrorMessage>}
          
          <Input
            type="email"
            name="email"
            label="Email"
            value={formData.email}
            onChange={handleInputChange}
            error={!!errors.email}
            errorMessage={errors.email}
            disabled={isLoading}
            required
            autoComplete="email"
            inputMode="email"
            aria-label="Email address"
          />
          
          <Input
            type="password"
            name="password"
            label="Password"
            value={formData.password}
            onChange={handleInputChange}
            error={!!errors.password}
            errorMessage={errors.password}
            disabled={isLoading}
            required
            autoComplete="current-password"
            aria-label="Password"
          />
          
          <Button
            type="submit"
            variant="primary"
            fullWidth
            loading={isLoading}
            disabled={isLoading}
            aria-label="Sign in with email"
          >
            Sign In
          </Button>
          
          <Divider />
          
          <Button
            type="button"
            variant="secondary"
            fullWidth
            onClick={() => handleSocialLogin('google')}
            loading={socialLoading.google}
            disabled={isLoading || socialLoading.google}
            aria-label="Sign in with Google"
          >
            Continue with Google
          </Button>
          
          <Button
            type="button"
            variant="secondary"
            fullWidth
            onClick={() => handleSocialLogin('apple')}
            loading={socialLoading.apple}
            disabled={isLoading || socialLoading.apple}
            aria-label="Sign in with Apple"
          >
            Continue with Apple
          </Button>
        </Form>
      </Container>
    </ErrorBoundary>
  );
};

export default LoginScreen;