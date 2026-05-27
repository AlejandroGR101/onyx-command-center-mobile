import { useState, useEffect, useRef } from "react";
import { Bell, ChevronDown, Check, LogOut, Menu } from "lucide-react";
import { useActiveUser, PROFILES, type UserProfile } from "@/lib/userContext";
import { useAuth } from "@/lib/authContext";
import { useMobileNav } from "@/lib/mobileNav";

export default function TopBar() {
  const [time, setTime] = useState(new Date());
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { activeUser, setActiveUser } = useActiveUser();
  const { logout } = useAuth();
  const { toggleSidebar } = useMobileNav();

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  function switchTo(profile: UserProfile) {
    setActiveUser(profile);
    setOpen(false);
  }

  return (
    <header
      data-testid="top-bar"
      className="h-14 flex items-center justify-between px-3 sm:px-6 border-b border-white/[0.06] relative"
      style={{ background: "rgba(10,10,12,0.8)", backdropFilter: "blur(12px)", zIndex: 30, overflow: "visible" }}
    >
      <div className="flex items-center gap-3">
        {/* Hamburger — mobile only */}
        <button
          data-testid="mobile-menu-toggle"
          onClick={toggleSidebar}
          className="md:hidden p-2 -ml-1 rounded-lg hover:bg-white/[0.04] transition-colors"
        >
          <Menu className="w-5 h-5 text-white/60" />
        </button>

        <span className="font-display font-semibold text-xs tracking-[0.25em] uppercase text-[#00e5ff]/70 text-glow-cyan hidden sm:inline">
          Command Center
        </span>
      </div>

      <div className="flex items-center gap-2 sm:gap-5">
        {/* Clock — hidden on mobile */}
        <div className="text-right hidden sm:block">
          <div className="text-xs text-white/50 font-mono tabular-nums" data-testid="current-date">
            {time.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
          </div>
          <div className="text-xs text-white/70 font-mono tabular-nums" data-testid="current-time">
            {time.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </div>
        </div>

        {/* Notifications */}
        <button data-testid="notifications-bell" className="relative p-2 rounded-lg hover:bg-white/[0.04] transition-colors">
          <Bell className="w-4 h-4 text-white/50" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#ff9100] rounded-full pulse-amber" />
        </button>

        {/* ── Profile Switcher ── */}
        <div ref={menuRef} className="relative">
          <button
            data-testid="profile-switcher-trigger"
            onClick={() => setOpen(!open)}
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/[0.04] transition-colors group"
          >
            {/* Avatar */}
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all"
              style={{
                background: activeUser.bgColor,
                color: activeUser.color,
                boxShadow: `0 0 0 2px ${activeUser.color}44, 0 0 12px ${activeUser.color}22`,
              }}
            >
              {activeUser.initials}
            </div>

            {/* Name + role — hidden on small screens */}
            <div className="text-left hidden lg:block">
              <div className="text-xs font-semibold text-white/90 leading-none">{activeUser.name}</div>
              <div className="text-[10px] text-white/40 leading-tight mt-0.5">{activeUser.role}</div>
            </div>

            <ChevronDown
              className={`w-3.5 h-3.5 text-white/30 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
            />
          </button>

          {/* ── Dropdown ── */}
          {open && (
            <div
              data-testid="profile-switcher-menu"
              className="absolute right-0 top-full mt-2 w-64 rounded-xl overflow-hidden z-50"
              style={{
                background: "rgba(18,19,26,0.96)",
                backdropFilter: "blur(24px)",
                border: "1px solid rgba(255,255,255,0.08)",
                boxShadow: "0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04) inset",
              }}
            >
              {/* Signed-in header */}
              <div className="px-4 pt-3.5 pb-2 border-b border-white/[0.06]">
                <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/30">
                  Switch Profile
                </div>
              </div>

              {/* Profile list */}
              <div className="py-1.5">
                {PROFILES.map((profile) => {
                  const isActive = profile.id === activeUser.id;
                  return (
                    <button
                      key={profile.id}
                      data-testid={`profile-option-${profile.id}`}
                      onClick={() => switchTo(profile)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                        isActive
                          ? "bg-white/[0.06]"
                          : "hover:bg-white/[0.04]"
                      }`}
                    >
                      {/* Mini avatar */}
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 transition-all"
                        style={{
                          background: profile.bgColor,
                          color: profile.color,
                          boxShadow: isActive ? `0 0 0 2px ${profile.color}66` : "none",
                        }}
                      >
                        {profile.initials}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-medium text-white/90 leading-none">{profile.name}</div>
                        <div className="text-[11px] text-white/40 mt-0.5 truncate">{profile.role}</div>
                      </div>

                      {isActive && (
                        <Check className="w-3.5 h-3.5 shrink-0" style={{ color: profile.color }} />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Footer */}
              <div className="border-t border-white/[0.06] px-4 py-2.5">
                <button
                  data-testid="profile-signout"
                  onClick={() => { setOpen(false); void logout(); }}
                  className="flex items-center gap-2 text-[11px] text-white/30 hover:text-white/50 transition-colors"
                >
                  <LogOut className="w-3 h-3" />
                  Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
