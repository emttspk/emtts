type GoogleAuthButtonProps = {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
};

function GoogleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" xmlns="http://www.w3.org/2000/svg">
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.5 3.8-5.5 3.8-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.2.8 3.9 1.5l2.7-2.6C17 3.3 14.7 2.4 12 2.4 6.8 2.4 2.6 6.6 2.6 11.8S6.8 21.2 12 21.2c6.9 0 9.2-4.8 9.2-7.3 0-.5-.1-.9-.1-1.3H12z" />
      <path fill="#34A853" d="M3.9 7.3l3.2 2.4c.9-1.8 2.8-3.1 4.9-3.1 1.9 0 3.2.8 3.9 1.5l2.7-2.6C17 3.3 14.7 2.4 12 2.4c-3.6 0-6.8 2-8.1 4.9z" />
      <path fill="#FBBC05" d="M12 21.2c2.7 0 4.9-.9 6.5-2.4l-3-2.4c-.8.6-2 1.1-3.5 1.1-2.8 0-5.1-1.9-6-4.4l-3.3 2.6c1.3 3 4.5 5.5 9.3 5.5z" />
      <path fill="#4285F4" d="M21.2 13.9c0-.6-.1-1.1-.2-1.6H12v3.9h5.2c-.2 1.2-.9 2.2-1.8 2.9l3 2.4c1.8-1.6 2.8-4 2.8-7.6z" />
    </svg>
  );
}

export default function GoogleAuthButton({ label, onClick, disabled = false, loading = false, className = "" }: GoogleAuthButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className={`google-auth-btn ${className}`.trim()}
    >
      <span className="google-auth-btn__icon" aria-hidden="true">
        <GoogleIcon />
      </span>
      <span className="google-auth-btn__label">{loading ? "Please wait..." : label}</span>
      <span className="google-auth-btn__spacer" aria-hidden="true" />
    </button>
  );
}
