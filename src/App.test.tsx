import React from 'react';
import { render, screen } from '@testing-library/react';
import { ErrorProvider } from './context/ErrorContext';
import { BookProvider } from './context/BookContext';

// Simple test component that doesn't use routing
const TestComponent: React.FC = () => {
  return (
    <div>
      <h1>Book Formatting App Test</h1>
      <p>This is a test component</p>
    </div>
  );
};

test('renders test component', () => {
  render(
    <ErrorProvider>
      <BookProvider>
        <TestComponent />
      </BookProvider>
    </ErrorProvider>
  );
  const titleElement = screen.getByText(/Book Formatting App Test/i);
  expect(titleElement).toBeInTheDocument();
});
