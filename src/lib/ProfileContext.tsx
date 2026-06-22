import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { useAuth } from "./auth";
import { fetchProfiles, ensureDefaultProfiles, type UserProfile } from "./profiles";

type ProfileContextValue = {
  profiles: UserProfile[];
  activeProfile: UserProfile | null;
  setActiveProfile: (p: UserProfile) => void;
  refreshProfiles: () => Promise<void>;
  profileSelected: boolean;
};

const ProfileContext = createContext<ProfileContextValue | null>(null);

const STORAGE_KEY = "ttflix_active_profile";

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { user, profile: authProfile, loading } = useAuth();
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [activeProfile, setActiveProfileState] = useState<UserProfile | null>(null);
  const [profileSelected, setProfileSelected] = useState(false);
  // Track whether we've done the first-time setup for this user already
  const setupDoneRef = useRef(false);

  const refreshProfiles = useCallback(async () => {
    if (!user || !authProfile) return;

    let list: UserProfile[];
    if (!setupDoneRef.current) {
      // First load — run ensureDefaultProfiles to create default+kids if missing
      setupDoneRef.current = true;
      list = await ensureDefaultProfiles(
        user.id,
        authProfile.full_name ?? authProfile.email ?? "Me",
        authProfile.plan
      );
    } else {
      // Subsequent refreshes (after edit/delete) — just fetch, never create
      list = await fetchProfiles(user.id);
    }
    setProfiles(list);

    // Restore last active profile from storage
    const savedId = localStorage.getItem(STORAGE_KEY);
    if (savedId) {
      const found = list.find((p) => p.id === savedId);
      if (found) {
        setActiveProfileState(found);
        setProfileSelected(true);
        return;
      }
    }
    setProfileSelected(false);
  }, [user, authProfile]);

  useEffect(() => {
    if (!loading && user && authProfile) {
      setupDoneRef.current = false; // reset on user change
      refreshProfiles();
    }
    if (!user) {
      setProfiles([]);
      setActiveProfileState(null);
      setProfileSelected(false);
      setupDoneRef.current = false;
    }
  }, [user, authProfile, loading, refreshProfiles]);

  const setActiveProfile = useCallback((p: UserProfile) => {
    setActiveProfileState(p);
    setProfileSelected(true);
    localStorage.setItem(STORAGE_KEY, p.id);
  }, []);

  return (
    <ProfileContext.Provider value={{ profiles, activeProfile, setActiveProfile, refreshProfiles, profileSelected }}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error("useProfile must be used within ProfileProvider");
  return ctx;
}
