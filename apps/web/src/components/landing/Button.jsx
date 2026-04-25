import { Link } from "react-router-dom";

export default function Button({ to, href, children, variant = "primary", className = "", ...props }) {
  const classes = `${variant === "secondary" ? "btn-secondary" : "btn-primary"} ${className}`.trim();

  if (to) {
    return (
      <Link to={to} className={classes} {...props}>
        {children}
      </Link>
    );
  }

  if (href) {
    return (
      <a href={href} className={classes} {...props}>
        {children}
      </a>
    );
  }

  return (
    <button className={classes} {...props}>
      {children}
    </button>
  );
}
