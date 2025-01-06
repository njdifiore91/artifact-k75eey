import React, { useState, useCallback } from 'react';
import styled from 'styled-components';
import { useNavigate } from 'react-router-dom';
import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google';
import { AppleSignIn } from '@apple-auth/apple-sign-in';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import { register } from '../../services/api/auth';
import { validateRegistrationRequest } from '../../utils/validation';
import type { RegisterRequest } from '../../types/user';

// Styled components with accessibility and platform adaptations
const Container = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: ${({ theme }) => theme.spacing.LARGE}px;
  background-color: ${({ theme }) => theme.colors.getColor('background')};
  
  @supports (padding: env(safe-area-inset-top)) {
    padding-top: max(${({ theme }) => theme.spacing.LARGE}px, env(safe-area-inset-top));
    padding-bottom: max(${({ theme }) => theme.spacing.LARGE}px, env(safe-area-inset-bottom));
  }
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 400px;
  gap: ${({ theme }) => theme.spacing.MEDIUM}px;
  padding: ${({ theme }) => theme.spacing.LARGE}px;
  background-color: ${({ theme }) => theme.colors.getColor('surface')};
  border-radius: 12px;
  box-shadow: 0 4px 6px ${({ theme }) => theme.colors.getColor('divider', 0.1)};

  @media (prefers-reduced-motion: no-preference) {
    animation: fadeIn 0.3s ease-in-out;
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(-10px); }
    to { opacity: 1; transform: translateY(0); }
  }
`;

const Divider = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.MEDIUM}px;
  margin: ${({ theme }) => theme.spacing.MEDIUM}px 0;
  color: ${({ theme }) => theme.colors.getColor('textSecondary')};

  &::before,
  &::after {
    content: '';
    flex: 1;
    height: 1px;
    background-color: ${({ theme }) => theme.colors.getColor('divider')};
  }
`;

const ErrorMessage = styled.div`
  color: ${({ theme }) => theme.colors.getColor('error')};
  font-size: 14px;
  margin-top: ${({ theme }) => theme.spacing.SMALL}px;
  padding: ${({ theme }) => theme.spacing.SMALL}px;
  border-radius: 4px;
  background-color: ${({ theme }) => theme.colors.getColor('error', 0.1)};
`;

const RegisterScreen: React.FC = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState<RegisterRequest>({
    email: '',
    password: '',
    fullName: '',
    acceptedTerms: false
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);

  const handleInputChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = event.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  }, [errors]);

  const handleSubmit = useCallback(async (event: React.FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    setGeneralError(null);

    // Validate form data
    const validationResult = validateRegistrationRequest(formData);
    if (!validationResult.isValid) {
      setErrors(validationResult.errors.reduce((acc, error) => ({
        ...acc,
        [error.field]: error.message
      }), {}));
      setIsLoading(false);
      return;
    }

    try {
      const response = await register(formData);
      if (response.success) {
        navigate('/verify-email');
      } else {
        setGeneralError(response.error?.message || 'Registration failed. Please try again.');
      }
    } catch (error) {
      setGeneralError('An unexpected error occurred. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  }, [formData, navigate]);

  const handleSocialAuth = useCallback(async (provider: 'google' | 'apple', token: string) => {
    setIsLoading(true);
    setGeneralError(null);

    try {
      const response = await register({
        ...formData,
        oauthToken: token,
        provider
      });
      if (response.success) {
        navigate('/verify-email');
      } else {
        setGeneralError(response.error?.message || 'Social authentication failed. Please try again.');
      }
    } catch (error) {
      setGeneralError('An unexpected error occurred. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  }, [formData, navigate]);

  return (
    <Container>
      <Form onSubmit={handleSubmit} noValidate>
        <h1>Create Account</h1>
        
        <Input
          type="text"
          name="fullName"
          label="Full Name"
          value={formData.fullName}
          onChange={handleInputChange}
          error={!!errors.fullName}
          errorMessage={errors.fullName}
          required
          autoComplete="name"
          disabled={isLoading}
        />

        <Input
          type="email"
          name="email"
          label="Email Address"
          value={formData.email}
          onChange={handleInputChange}
          error={!!errors.email}
          errorMessage={errors.email}
          required
          autoComplete="email"
          disabled={isLoading}
          inputMode="email"
        />

        <Input
          type="password"
          name="password"
          label="Password"
          value={formData.password}
          onChange={handleInputChange}
          error={!!errors.password}
          errorMessage={errors.password}
          required
          autoComplete="new-password"
          disabled={isLoading}
        />

        <Input
          type="checkbox"
          name="acceptedTerms"
          label="I accept the Terms of Service and Privacy Policy"
          onChange={handleInputChange}
          checked={formData.acceptedTerms}
          error={!!errors.acceptedTerms}
          errorMessage={errors.acceptedTerms}
          required
          disabled={isLoading}
        />

        {generalError && (
          <ErrorMessage role="alert">
            {generalError}
          </ErrorMessage>
        )}

        <Button
          type="submit"
          variant="primary"
          fullWidth
          loading={isLoading}
          disabled={isLoading}
        >
          Create Account
        </Button>

        <Divider>or continue with</Divider>

        <GoogleOAuthProvider clientId={process.env.REACT_APP_GOOGLE_CLIENT_ID!}>
          <GoogleLogin
            onSuccess={response => handleSocialAuth('google', response.credential)}
            onError={() => setGeneralError('Google authentication failed. Please try again.')}
            theme="outline"
            shape="rectangular"
            width="100%"
          />
        </GoogleOAuthProvider>

        <AppleSignIn
          clientId={process.env.REACT_APP_APPLE_CLIENT_ID!}
          redirectURI={process.env.REACT_APP_APPLE_REDIRECT_URI!}
          scope="name email"
          onSuccess={response => handleSocialAuth('apple', response.authorization.id_token)}
          onError={() => setGeneralError('Apple authentication failed. Please try again.')}
          render={props => (
            <Button
              variant="secondary"
              fullWidth
              onClick={props.onClick}
              disabled={isLoading}
              icon={<AppleIcon />}
            >
              Continue with Apple
            </Button>
          )}
        />

        <Button
          variant="text"
          onClick={() => navigate('/login')}
          disabled={isLoading}
        >
          Already have an account? Sign in
        </Button>
      </Form>
    </Container>
  );
};

export default RegisterScreen;