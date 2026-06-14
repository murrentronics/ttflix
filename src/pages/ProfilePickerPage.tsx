import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Pencil, Trash2, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useProfile } from "@/lib/ProfileContext";
import { createProfile, deleteProfile, updateProfile, maxProfiles, randomColor, type UserProfile } from "@/lib/profiles";

export function ProfilePickerPage() {
  const { user, profile: authProfile, isAdmin } = useAuth();
  const { profiles, setActiveProfile, refreshProfiles } = useProfile();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newIsKids, setNewIsKids] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editTarget, setEditTarget] = useState<UserProfile | null>(null);
  const [editName, setEditName] = useState("");

  const plan = authProfile?.plan ?? "basic";
  const max = maxProfiles(plan);
  // Deduplicate: show only one profile per name+is_kids combo (guards against DB dupes)
  const uniqueProfiles = profiles.filter(
    (p, i, arr) => arr.findIndex((x) => x.name === p.name && x.is_kids === p.is_kids) === i
  );
  // Admin has no profile limit
  const canAdd = isAdmin ? true : uniqueProfiles.length < max;

  const handleAdd = async () => {
    if (!user || !newName.trim()) return;
    setBusy(true);
    try {
      await createProfile(user.id, newName.trim(), { isKids: newIsKids, color: randomColor() });
      await refreshProfiles();
      setShowAdd(false);
      setNewName("");
      setNewIsKids(false);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (p: UserProfile) => {
    if (p.is_default) return; // can't delete default
    setBusy(true);
    try {
      await deleteProfile(p.id);
      await refreshProfiles();
    } finally {
      setBusy(false);
    }
  };

  const handleEdit = async () => {
    if (!editTarget || !editName.trim()) return;
    setBusy(true);
    try {
      await updateProfile(editTarget.id, { name: editName.trim() });
      await refreshProfiles();
      setEditTarget(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <h1 className="mb-2 text-3xl font-extrabold text-primary">TT<span className="text-foreground">FLIX</span></h1>
      <h2 className="mb-10 text-xl font-semibold text-foreground">Who's watching?</h2>

      <div className="flex flex-wrap justify-center gap-6">
        {uniqueProfiles.map((p) => (
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
              onClick={() => setShowAdd(true)}
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

      {/* Add profile modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold">New Profile</h3>
              <button onClick={() => setShowAdd(false)}><X className="h-5 w-5" /></button>
            </div>
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Profile name"
              className="w-full rounded-md border border-border bg-input px-3 py-2 outline-none focus:border-primary"
            />
            <label className="mt-3 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={newIsKids} onChange={(e) => setNewIsKids(e.target.checked)} className="h-4 w-4 accent-primary" />
              Kids profile (restricted content)
            </label>
            <button
              onClick={handleAdd}
              disabled={busy || !newName.trim()}
              className="mt-4 w-full rounded-md bg-primary py-2.5 font-semibold text-primary-foreground transition hover:bg-primary/85 disabled:opacity-60"
            >
              {busy ? "Creating…" : "Create Profile"}
            </button>
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
              onChange={(e) => setEditName(e.target.value)}
              className="w-full rounded-md border border-border bg-input px-3 py-2 outline-none focus:border-primary"
            />
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
