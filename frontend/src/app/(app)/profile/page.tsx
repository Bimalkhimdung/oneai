'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { User, Mail, Shield, Calendar, LogOut, KeyRound } from 'lucide-react';
import type { UserDto } from '@/types/shared';

export default function ProfilePage() {
  const router = useRouter();
  const { user, accessToken, setSession, clear } = useAuthStore();

  const [fullName, setFullName] = useState(user?.fullName || '');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  if (!user) return null;

  async function handleUpdateProfile(e: React.FormEvent) {
    e.preventDefault();

    if (newPassword && newPassword !== confirmPassword) {
      toast.error("New passwords do not match!");
      return;
    }

    try {
      setIsSaving(true);
      const updatedUser = await api<UserDto>('/me/', {
        method: 'PUT',
        body: JSON.stringify({
          fullName: fullName || undefined,
          oldPassword: oldPassword || undefined,
          newPassword: newPassword || undefined,
        }),
      });

      if (accessToken) {
        setSession(updatedUser, accessToken);
      }
      
      toast.success("Profile updated successfully!");
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      toast.error(err?.message || "Failed to update profile details.");
    } finally {
      setIsSaving(false);
    }
  }

  function handleLogout() {
    clear();
    toast.success("Logged out successfully");
    router.push('/login');
  }

  const initials = user.fullName
    ? user.fullName.split(' ').map((n) => n[0]).join('').toUpperCase()
    : 'U';

  const joinedDate = user.createdAt
    ? new Date(user.createdAt).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : 'Unknown';

  return (
    <div className="space-y-8 max-w-4xl mx-auto">

      <div className="grid gap-6 md:grid-cols-3">
        {/* Info card (Left Column) */}
        <div className="md:col-span-1 space-y-6">
          <Card className="border-muted/40 shadow-sm overflow-hidden flex flex-col items-center p-6 text-center card-glossy">
            <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-3xl border border-primary/20 shadow-md mb-4">
              {initials}
            </div>
            <h3 className="font-semibold text-lg leading-none">{user.fullName}</h3>
            <p className="text-xs text-muted-foreground mt-1.5">{user.email}</p>
            <div className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold bg-primary/10 border-primary/20 text-primary mt-3 uppercase">
              {user.role}
            </div>
          </Card>

          <Card className="border-muted/40 shadow-sm p-4 space-y-4">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Account Details</h4>
            <div className="space-y-3">
              <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
                <Mail className="h-4 w-4 shrink-0 text-foreground/70" />
                <span className="truncate">{user.email}</span>
              </div>
              <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
                <Shield className="h-4 w-4 shrink-0 text-foreground/70" />
                <span>Role: <strong className="capitalize text-foreground font-medium">{user.role.toLowerCase()}</strong></span>
              </div>
              <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
                <Calendar className="h-4 w-4 shrink-0 text-foreground/70" />
                <span>Joined {joinedDate}</span>
              </div>
            </div>

            <div className="pt-2 border-t border-border/40">
              <Button
                variant="destructive"
                className="w-full text-xs gap-2"
                onClick={handleLogout}
              >
                <LogOut className="h-3.5 w-3.5" />
                Log out of account
              </Button>
            </div>
          </Card>
        </div>

        {/* Update Form (Right Column) */}
        <div className="md:col-span-2">
          <Card className="border-muted/40 shadow-sm">
            <CardHeader>
              <CardTitle>Profile Details</CardTitle>
              <CardDescription>
                Update your display name and sign-in password.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleUpdateProfile} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    Full Name
                  </label>
                  <Input
                    required
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Enter your name"
                  />
                </div>

                <div className="pt-4 border-t border-border/40 space-y-4">
                  <h4 className="text-sm font-medium flex items-center gap-2 text-foreground">
                    <KeyRound className="h-4 w-4 text-muted-foreground" />
                    Change Password
                  </h4>
                  <p className="text-xs text-muted-foreground leading-normal">
                    Leave these password fields blank if you do not wish to change your account password.
                  </p>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2 sm:col-span-2">
                      <label className="text-xs font-semibold text-muted-foreground uppercase">Current Password</label>
                      <Input
                        type="password"
                        value={oldPassword}
                        onChange={(e) => setOldPassword(e.target.value)}
                        placeholder="••••••••"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-muted-foreground uppercase">New Password</label>
                      <Input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Min 8 characters"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-muted-foreground uppercase">Confirm New Password</label>
                      <Input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-4 border-t border-border/40">
                  <Button type="submit" disabled={isSaving}>
                    {isSaving ? 'Saving Changes…' : 'Save Changes'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
