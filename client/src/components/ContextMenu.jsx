import { useEffect, useRef } from 'react';

export default function ContextMenu({ x, y, items, onClose }) {
  const menuRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  // Prevent menu from going off-screen
  const style = {
    top: Math.min(y, window.innerHeight - 150), // Approximate height
    left: Math.min(x, window.innerWidth - 200), // Approximate width
  };

  return (
    <div
      ref={menuRef}
      className="fixed z-[150] w-48 bg-zinc-900 border border-white/10 rounded-xl shadow-2xl py-2 overflow-hidden backdrop-blur-lg"
      style={style}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, index) => (
        <button
          key={index}
          onClick={(e) => {
            e.stopPropagation();
            item.onClick();
            onClose();
          }}
          className={`w-full text-left px-4 py-2.5 text-sm font-medium flex items-center gap-3 transition-colors ${
            item.danger ? 'text-red-500 hover:bg-red-500/10' : 'text-gray-300 hover:bg-white/10 hover:text-white'
          }`}
        >
          {item.icon && <span className="flex-shrink-0">{item.icon}</span>}
          {item.label}
        </button>
      ))}
    </div>
  );
}
