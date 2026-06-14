import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { useAuth } from "./auth";
import { fetchProfiles, ensureDefaultProfiles, type UserProfile } from "./profiles";

type ProfileContextValue = {
  profiles: UserProfile[];
  activeProfile: UserProfile | null;
  setActiveProfile: (p: UserProfile) => void;
  refreshProfiles: () => Promise<void>;
  profileSelected: boolean; // false = still on profile picker screen
};

const ProfileContext = createContext<ProfileContextValue | null>(null);

const STORAGE_KEY = "ttflix_active_profile";

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { user, profile: authProfile, loading } = useAuth();
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [activeProfile, setActiveProfileState] = useState<UserProfile | null>(null);
  const [profileSelected, setProfileSelected] = useState(false);

  const refreshProfiles = useCallback(async () => {
    if (!user || !authProfile) return;
    const list = await ensureDefaultProfiles(
      user.id,
      authProfile.full_name ?? authProfile.email ?? "Me",
      authProfile.plan
    );
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
    // Don't auto-select — show picker
    setProfileSelected(false);
  }, [user, authProfile]);

  useEffect(() => {
    if (!loading && user && authProfile) {
      refreshProfiles();
    }
    if (!user) {
      setProfiles([]);
      setActiveProfileState(null);
      setProfileSelected(false);
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
