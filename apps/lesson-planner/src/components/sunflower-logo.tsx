export function SunflowerLogo() {
  return <svg className="app-logo-mark" viewBox="0 0 40 40" fill="none" aria-hidden="true">
    {Array.from({ length: 10 }, (_, index) => <path key={index} d="M20 2.5C15.2 7 15.6 11.8 20 14.2C24.4 11.8 24.8 7 20 2.5Z" transform={`rotate(${index * 36} 20 20)`} fill={index % 2 ? "#E8AA37" : "#F3C85C"} />)}
    <circle cx="20" cy="20" r="8.4" fill="#F3C85C" />
    <path d="M26.4 17.7C27.8 22.1 24.7 27 20 27C15.8 27 12.6 23.5 13 19.4C13.3 15.8 16.3 13 20 13C22.1 13 23.6 13.9 24.5 15.3" fill="#65405B" />
    <circle cx="17.7" cy="18.2" r="1" fill="#F7DE91" />
    <circle cx="22" cy="20" r="1" fill="#F7DE91" />
    <circle cx="18.5" cy="23" r="1" fill="#F7DE91" />
  </svg>;
}
