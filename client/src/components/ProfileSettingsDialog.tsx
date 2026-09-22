import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings } from "lucide-react";

interface ProfileSettingsDialogProps {
  /** 'admin' for admin/trainer users, 'teacher' for teacher users */
  userType: "admin" | "teacher";
  currentEmail?: string;
  trigger?: React.ReactNode;
}

export function ProfileSettingsDialog({
  userType,
  currentEmail,
  trigger,
}: ProfileSettingsDialogProps) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("profile");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Password change state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Email change state
  const [emailPassword, setEmailPassword] = useState("");
  const [newEmail, setNewEmail] = useState("");

  // Profile state
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [name, setName] = useState(""); // teacher only
  const [fatherName, setFatherName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [qualification, setQualification] = useState("");
  const [cnic, setCnic] = useState("");
  const [gender, setGender] = useState("");
  const [location, setLocation] = useState(""); // teacher only
  const [dateOfBirth, setDateOfBirth] = useState("");

  const profileEndpoint = userType === "admin" ? "/api/profile/details" : "/api/teacher/profile/details";
  const passwordEndpoint = userType === "admin" ? "/api/profile/change-password" : "/api/teacher/profile/change-password";
  const emailEndpoint = userType === "admin" ? "/api/profile/change-email" : "/api/teacher/profile/change-email";

  // Fetch existing profile when dialog opens
  const { data: profileData } = useQuery<any>({
    queryKey: [profileEndpoint],
    queryFn: async () => {
      const res = await fetch(profileEndpoint, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: open,
  });

  // Populate form when data loads
  useEffect(() => {
    if (!profileData) return;
    if (userType === "admin") {
      setFirstName(profileData.firstName || "");
      setLastName(profileData.lastName || "");
    } else {
      setName(profileData.name || "");
      setLocation(profileData.location || "");
    }
    setFatherName(profileData.fatherName || "");
    setPhoneNumber(profileData.phoneNumber || "");
    setQualification(profileData.qualification || "");
    setCnic(profileData.cnic || "");
    setGender(profileData.gender || "");
    if (profileData.dateOfBirth) {
      setDateOfBirth(new Date(profileData.dateOfBirth).toISOString().split("T")[0]);
    }
  }, [profileData, userType]);

  const saveProfileMutation = useMutation({
    mutationFn: async () => {
      const body = userType === "admin"
        ? { firstName, lastName, fatherName, phoneNumber, qualification, cnic, gender, dateOfBirth: dateOfBirth || null }
        : { name, fatherName, phoneNumber, qualification, cnic, gender, location };
      const res = await fetch(profileEndpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save profile");
      return data;
    },
    onSuccess: () => {
      toast({ title: "Profile Updated", description: "Your profile has been saved." });
      queryClient.invalidateQueries({ queryKey: [profileEndpoint] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: async () => {
      if (newPassword !== confirmPassword) throw new Error("Passwords do not match");
      if (newPassword.length < 6) throw new Error("New password must be at least 6 characters");
      const res = await fetch(passwordEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to change password");
      return data;
    },
    onSuccess: (data) => {
      toast({ title: "Password Changed", description: data.message || "Your password has been updated." });
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
      setOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const changeEmailMutation = useMutation({
    mutationFn: async () => {
      if (!newEmail || !newEmail.includes("@")) throw new Error("Please enter a valid email address");
      const res = await fetch(emailEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: emailPassword, newEmail }),
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to change email");
      return data;
    },
    onSuccess: (data) => {
      toast({ title: "Email Changed", description: data.message || "Your email has been updated." });
      setEmailPassword(""); setNewEmail("");
      setOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
    setEmailPassword(""); setNewEmail("");
    setActiveTab("profile");
  };

  const qualificationOptions = [
    { value: "matric", label: "Matric" },
    { value: "intermediate", label: "Intermediate" },
    { value: "bachelor", label: "Bachelor's Degree" },
    { value: "master", label: "Master's Degree" },
    { value: "phd", label: "PhD" },
    { value: "diploma", label: "Diploma / Certificate" },
    { value: "other", label: "Other" },
  ];

  const genderOptions = [
    { value: "male", label: "Male" },
    { value: "female", label: "Female" },
    { value: "other", label: "Other" },
    { value: "prefer_not_to_say", label: "Prefer not to say" },
  ];

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { setOpen(isOpen); if (!isOpen) resetForm(); }}>
      <DialogTrigger asChild>
        {trigger || (
          <Button
            variant="secondary"
            size="icon"
            data-testid="button-profile-settings"
            className="h-8 w-8 sm:h-9 sm:w-auto sm:px-3 bg-white/10 hover:bg-white/20 text-white border-white/20"
          >
            <Settings className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Settings</span>
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Account Settings</DialogTitle>
        </DialogHeader>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="password">Password</TabsTrigger>
            <TabsTrigger value="email">Email</TabsTrigger>
          </TabsList>

          {/* ── Profile Tab ─────────────────────────────────── */}
          <TabsContent value="profile" className="space-y-4 py-4">
            {userType === "admin" ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>First Name</Label>
                  <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First name" />
                </div>
                <div className="space-y-1">
                  <Label>Last Name</Label>
                  <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last name" />
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                <Label>Full Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name" />
              </div>
            )}

            <div className="space-y-1">
              <Label>Father's Name</Label>
              <Input value={fatherName} onChange={(e) => setFatherName(e.target.value)} placeholder="Father's name" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Phone Number</Label>
                <Input value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="+92 300 0000000" />
              </div>
              <div className="space-y-1">
                <Label>CNIC / NIDA No#</Label>
                <Input value={cnic} onChange={(e) => setCnic(e.target.value)} placeholder="00000-0000000-0" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Gender</Label>
                <Select value={gender} onValueChange={setGender}>
                  <SelectTrigger><SelectValue placeholder="Select gender" /></SelectTrigger>
                  <SelectContent>
                    {genderOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Qualification</Label>
                <Select value={qualification} onValueChange={setQualification}>
                  <SelectTrigger><SelectValue placeholder="Select qualification" /></SelectTrigger>
                  <SelectContent>
                    {qualificationOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {userType === "teacher" && (
              <div className="space-y-1">
                <Label>City / Location</Label>
                <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Karachi" />
              </div>
            )}

            {userType === "admin" && (
              <div className="space-y-1">
                <Label>Date of Birth</Label>
                <Input type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} />
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={() => saveProfileMutation.mutate()} disabled={saveProfileMutation.isPending}>
                {saveProfileMutation.isPending ? "Saving..." : "Save Profile"}
              </Button>
            </DialogFooter>
          </TabsContent>

          {/* ── Password Tab ─────────────────────────────────── */}
          <TabsContent value="password" className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="currentPassword">Current Password</Label>
              <PasswordInput id="currentPassword" placeholder="Enter current password" value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)} data-testid="input-current-password" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword">New Password</Label>
              <PasswordInput id="newPassword" placeholder="Enter new password (min 6 characters)" value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)} data-testid="input-new-password" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm New Password</Label>
              <PasswordInput id="confirmPassword" placeholder="Confirm new password" value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)} data-testid="input-confirm-password" />
            </div>
            <p className="text-xs text-muted-foreground">
              Changing your password will update it for all linked accounts.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={() => changePasswordMutation.mutate()}
                disabled={changePasswordMutation.isPending || !currentPassword || !newPassword || !confirmPassword}
                data-testid="button-change-password">
                {changePasswordMutation.isPending ? "Changing..." : "Change Password"}
              </Button>
            </DialogFooter>
          </TabsContent>

          {/* ── Email Tab ─────────────────────────────────── */}
          <TabsContent value="email" className="space-y-4 py-4">
            {currentEmail && (
              <div className="space-y-2">
                <Label>Current Email</Label>
                <Input value={currentEmail} disabled />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="newEmail">New Email</Label>
              <Input id="newEmail" type="email" placeholder="Enter new email address" value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)} data-testid="input-new-email" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="emailPassword">Password</Label>
              <PasswordInput id="emailPassword" placeholder="Enter your password to confirm" value={emailPassword}
                onChange={(e) => setEmailPassword(e.target.value)} data-testid="input-email-password" />
            </div>
            <p className="text-xs text-muted-foreground">
              Changing your email will update it for all linked accounts.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={() => changeEmailMutation.mutate()}
                disabled={changeEmailMutation.isPending || !emailPassword || !newEmail}
                data-testid="button-change-email">
                {changeEmailMutation.isPending ? "Changing..." : "Change Email"}
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
