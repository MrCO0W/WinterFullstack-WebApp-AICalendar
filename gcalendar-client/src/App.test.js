import { render, screen, fireEvent } from '@testing-library/react';
process.env.REACT_APP_GOOGLE_CLIENT_ID = '';
const LoginPage = require('./LoginPage').default;

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate }), { virtual: true });

beforeEach(() => {
  sessionStorage.clear();
  mockNavigate.mockClear();
});

test('shows calendar connection and recovers from missing configuration', async () => {
  render(<LoginPage />);
  fireEvent.click(screen.getByRole('button', { name: 'Connect Google Calendar' }));
  expect(await screen.findByText(/Google 연결 설정이 없습니다/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
  expect(screen.getByRole('button', { name: 'Connect Google Calendar' })).toBeEnabled();
});

test('continues to calendar when a token is already present', () => {
  sessionStorage.setItem('google_access_token', 'test-token');
  render(<LoginPage />);
  expect(mockNavigate).toHaveBeenCalledWith('/calendar', { replace: true });
});
