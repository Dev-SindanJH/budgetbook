const paths = {
  home: 'm3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  chart: 'M4 3v17h17M9 15v-4M14 15V7M19 15V4',
  wallet:
    'M20 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h15V8H5a3 3 0 0 1 0-6M20 12h-5v5h5M16 14.5h.01',
  settings:
    'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1Z',
  plus: 'M12 5v14M5 12h14',
  close: 'm6 6 12 12M18 6 6 18',
  right: 'm9 5 7 7-7 7',
  left: 'm15 5-7 7 7 7',
  arrow: 'M5 12h14m-5-5 5 5-5 5',
  up: 'M12 19V5m-5 5 5-5 5 5',
  down: 'M12 5v14m-5-5 5 5 5-5',
  card: 'M3 8h18M5 16h4M4 4h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z',
  calendar:
    'M8 2v4M16 2v4M3 10h18M4 4h16a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z',
  check: 'm5 12 4 4L19 6',
  info: 'M12 11v6M12 7h.01M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20',
  logout: 'M9 3H4v18h5M9 12h12m-5-5 5 5-5 5',
  people:
    'M16 21v-2a5 5 0 0 0-5-5H8a5 5 0 0 0-5 5v2M10 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8M17 4a4 4 0 0 1 0 7M21 21v-2a5 5 0 0 0-3-4.6',
  shield: 'm12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Zm-4 9 3 3 5-6',
}
export default function Icon({ name, size = 20, ...props }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d={paths[name] || paths.wallet} />
    </svg>
  )
}
