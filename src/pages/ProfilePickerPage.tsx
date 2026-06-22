import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Pencil, Trash2, X, User, Baby } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useProfile } from "@/lib/ProfileContext";
import { createProfile, deleteProfile, updateProfile, maxProfiles, randomColor, type UserProfile } from "@/lib/profiles";

export function ProfilePickerPage() {
  const { user, profile: authProfile, isAdmin } = useAuth();
  const { profiles, setActiveProfile, refreshProfiles, activeProfile } = useProfile();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [addStep, setAddStep] = useState<"closed" | "pick-type" | "enter-name">("closed");
  const [newIsKids, setNewIsKids] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [editTarget, setEditTarget] = useState<UserProfile | null>(null);
  const [editName, setEditName] = useState("");
  const [editError, setEditError] = useState("");

  const plan = authProfile?.plan ?? "basic";
  const max = maxProfiles(plan);
  // Protected profiles: the main (is_default) and kids (is_kids) profiles cannot be deleted
  // Extra profiles (neither is_default nor is_kids) can be deleted
  const canAdd = isAdmin ? true : profiles.length < max;

  const handleAdd = async () => {
    if (!user || !newName.trim()) return;
    setBusy(true);
    try {
      await createProfile(user.id, newName.trim(), { isKids: newIsKids, color: randomColor() });
      await refreshProfiles();
      setAddStep("closed");
      setNewName("");
      setNewIsKids(false);
    } finally {
      setBusy(false);
    }
  };

  const openAddPicker = () => {
    setNewName("");
    setNewIsKids(false);
    setAddStep("pick-type");
  };

  const handleDelete = async (p: UserProfile) => {
    if (p.is_default) return; // can't delete the default profile
    setBusy(true);
    try {
      await deleteProfile(p.id);
      // If we just deleted the active profile, switch to the default
      if (activeProfile?.id === p.id) {
        const fallback = profiles.find((x) => x.is_default && x.id !== p.id);
        if (fallback) setActiveProfile(fallback);
      }
      await refreshProfiles();
    } finally {
      setBusy(false);
    }
  };

  const handleEdit = async () => {
    if (!editTarget || !editName.trim()) return;
    setBusy(true);
    setEditError("");
    try {
      await updateProfile(editTarget.id, { name: editName.trim() });
      // If this was the active profile, update it in context too
      if (activeProfile?.id === editTarget.id) {
        setActiveProfile({ ...editTarget, name: editName.trim() });
      }
      await refreshProfiles();
      setEditTarget(null);
    } catch {
      setEditError("Failed to save. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <h1 className="mb-2 text-3xl font-extrabold text-primary">TT<span className="text-foreground">FLIX</span></h1>
      <h2 className="mb-10 text-xl font-semibold text-foreground">Who's watching?</h2>

      <div className="flex flex-wrap justify-center gap-6">
        {profiles.map((p) => (
          <div key={p.id} className="relative flex flex-col items-center gap-2">
            {/* Avatar */}
            <button
              onClick={() => {
                if (!editing) {
                  setActiveProfile(p);
                  navigate("/");
                }
              }}
              className="relative h-24 w-24 overflow-hidden rounded-lg transition-transform hover:scale-105 active:scale-95"
              style={{ backgroundColor: p.avatar_color }}
              disabled={editing}
            >
              <span className="flex h-full w-full items-center justify-center text-3xl font-extrabold text-white">
                {p.is_kids ? "👶" : p.name.charAt(0).toUpperCase()}
              </span>
            </button>

            <span className="text-sm font-medium text-foreground/80">
              {p.name}{p.is_kids ? " 👶" : ""}
            </span>

            {/* Edit mode buttons */}
            {editing && (
              <div className="flex gap-1">
                <button
                  onClick={() => { setEditTarget(p); setEditName(p.name); }}
                  className="rounded-full bg-secondary p-1.5 hover:bg-accent"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                {!p.is_default && !p.is_kids && (
                  <button
                    onClick={() => handleDelete(p)}
                    className="rounded-full bg-destructive/20 p-1.5 hover:bg-destructive/40"
                    aria-label="Delete profile"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </button>
                )}
              </div>
            )}
          </div>
        ))}

        {!editing && canAdd && (
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={openAddPicker}
              className="flex h-24 w-24 items-center justify-center rounded-lg border-2 border-dashed border-border transition hover:border-primary hover:bg-primary/10"
            >
              <Plus className="h-8 w-8 text-muted-foreground" />
            </button>
            <span className="text-sm text-muted-foreground">Add Profile</span>
          </div>
        )}
        {!editing && !canAdd && !isAdmin && (
          <p className="w-full text-center text-xs text-muted-foreground mt-2">
            Profile limit reached for your <span className="font-semibold capitalize">{plan}</span> plan ({max} profiles max).
          </p>
        )}
      </div>

      {/* Manage/Done button */}
      <button
        onClick={() => setEditing((e) => !e)}
        className="mt-10 rounded-md border border-border px-6 py-2 text-sm font-semibold text-foreground transition hover:bg-accent"
      >
        {editing ? "Done" : "Manage Profiles"}
      </button>

      {/* Step 1 — pick profile type */}
      {addStep === "pick-type" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-lg font-bold">Add Profile</h3>
              <button onClick={() => setAddStep("closed")}><X className="h-5 w-5" /></button>
            </div>
            <p className="mb-4 text-sm text-muted-foreground">Who is this profile for?</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => { setNewIsKids(false); setAddStep("enter-name"); }}
                className="flex flex-col items-center gap-3 rounded-xl border-2 border-border bg-background p-5 transition hover:border-primary hover:bg-primary/10"
              >
                <User className="h-10 w-10 text-foreground/70" />
                <span className="text-sm font-semibold">Adult</span>
                <span className="text-xs text-muted-foreground text-center">All content</span>
              </button>
              <button
                onClick={() => { setNewIsKids(true); setAddStep("enter-name"); }}
                className="flex flex-col items-center gap-3 rounded-xl border-2 border-border bg-background p-5 transition hover:border-primary hover:bg-primary/10"
              >
                <Baby className="h-10 w-10 text-blue-400" />
                <span className="text-sm font-semibold">Kids</span>
                <span className="text-xs text-muted-foreground text-center">Family-friendly only</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 2 — enter name */}
      {addStep === "enter-name" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold">
                  {newIsKids ? "👶 Kids Profile" : "🧑 Adult Profile"}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {newIsKids ? "Family-friendly content only" : "Full access to all content"}
                </p>
              </div>
              <button onClick={() => setAddStep("pick-type")}><X className="h-5 w-5" /></button>
            </div>
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              placeholder="Profile name"
              className="w-full rounded-md border border-border bg-input px-3 py-2 outline-none focus:border-primary"
            />
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setAddStep("pick-type")}
                className="flex-1 rounded-md border border-border py-2.5 text-sm font-semibold transition hover:bg-accent"
              >
                Back
              </button>
              <button
                onClick={handleAdd}
                disabled={busy || !newName.trim()}
                className="flex-1 rounded-md bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/85 disabled:opacity-60"
              >
                {busy ? "Creating…" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit profile modal */}
      {editTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold">Edit Profile</h3>
              <button onClick={() => setEditTarget(null)}><X className="h-5 w-5" /></button>
            </div>
            <input
              autoFocus
              value={editName}
              onChange={(e) => { setEditName(e.target.value); setEditError(""); }}
              className="w-full rounded-md border border-border bg-input px-3 py-2 outline-none focus:border-primary"
            />
            {editError && <p className="mt-2 text-xs text-destructive">{editError}</p>}
            <button
              onClick={handleEdit}
              disabled={busy || !editName.trim()}
              className="mt-4 w-full rounded-md bg-primary py-2.5 font-semibold text-primary-foreground transition hover:bg-primary/85 disabled:opacity-60"
            >
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
