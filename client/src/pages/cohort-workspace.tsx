import { useMemo, useState } from "react";
import { useParams, useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ArrowLeft, Users, ClipboardCheck, Award, BarChart3, GraduationCap, Megaphone, Calendar, FileText, Upload } from "lucide-react";
import { learningStatus, staffWatchLabel } from "@shared/learningStatus";
import logoImage from "@assets/Screenshot 2025-10-14 214034_1761029433045.png";

export default function CohortWorkspace() {
  const params = useParams<{ batchId: string }>();
  const batchId = params.batchId;
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const today = new Date().toISOString().slice(0, 10);
  const [attendanceDate, setAttendanceDate] = useState(today);
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [announceTitle, setAnnounceTitle] = useState("");
  const [announceMessage, setAnnounceMessage] = useState("");
  const [csvText, setCsvText] = useState("name,email,password\n");
  const [workTitle, setWorkTitle] = useState("");
  const [workInstructions, setWorkInstructions] = useState("");
  const [workDue, setWorkDue] = useState("");
  const [openWorkId, setOpenWorkId] = useState<string | null>(null);
  const [markDrafts, setMarkDrafts] = useState<Record<string, { score: string; comment: string }>>({});
  const [eventTitle, setEventTitle] = useState("");
  const [eventType, setEventType] = useState("session");
  const [eventStart, setEventStart] = useState("");

  const { data: batch, isLoading } = useQuery<any>({
    queryKey: ["/api/batches", batchId],
    enabled: Boolean(batchId),
  });

  const { data: quizzes = [] } = useQuery<any[]>({
    queryKey: ["/api/batches", batchId, "quizzes"],
    enabled: Boolean(batchId),
  });

  const { data: fileQuizzes = [] } = useQuery<any[]>({
    queryKey: ["/api/batches", batchId, "file-quizzes"],
    queryFn: async () => {
      const res = await fetch(`/api/batches/${batchId}/file-quizzes`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: Boolean(batchId),
  });

  const { data: progress = [] } = useQuery<any[]>({
    queryKey: ["/api/batches", batchId, "progress"],
    enabled: Boolean(batchId),
  });

  const { data: attendance = [] } = useQuery<any[]>({
    queryKey: ["/api/batches", batchId, "attendance", "summary"],
    queryFn: async () => {
      const res = await fetch(`/api/batches/${batchId}/attendance/summary`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: Boolean(batchId),
  });

  const { data: certificates = [] } = useQuery<any[]>({
    queryKey: ["/api/batches", batchId, "certificates"],
    enabled: Boolean(batchId),
  });

  const { data: events = [] } = useQuery<any[]>({
    queryKey: ["/api/batches", batchId, "events"],
    queryFn: async () => {
      const res = await fetch(`/api/batches/${batchId}/events`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: Boolean(batchId),
  });

  const { data: assignments = [] } = useQuery<any[]>({
    queryKey: ["/api/batches", batchId, "assignments"],
    queryFn: async () => {
      const res = await fetch(`/api/batches/${batchId}/assignments`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: Boolean(batchId),
  });

  const { data: announcements = [] } = useQuery<any[]>({
    queryKey: ["/api/batches", batchId, "announcements"],
    queryFn: async () => {
      const res = await fetch(`/api/batches/${batchId}/announcements`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: Boolean(batchId),
  });

  const { data: submissions = [] } = useQuery<any[]>({
    queryKey: ["/api/batches", batchId, "assignments", openWorkId, "submissions"],
    queryFn: async () => {
      const res = await fetch(`/api/batches/${batchId}/assignments/${openWorkId}/submissions`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: Boolean(batchId && openWorkId),
  });

  const teachers = Array.isArray(batch?.teachers) ? batch.teachers : [];
  const closeToGraduate = useMemo(
    () => progress.filter((row) => (row.overallPercentage || 0) >= 80 && (row.overallPercentage || 0) < 100),
    [progress],
  );
  const overview = useMemo(() => {
    const rows = Array.isArray(progress) ? progress : [];
    const statuses = rows.map((row) => learningStatus({ percentage: row.overallPercentage || 0 }));
    return {
      total: teachers.length,
      completed: statuses.filter((s) => s === "Completed" || s === "Passed").length,
      inProgress: statuses.filter((s) => s === "In Progress").length,
      notStarted: statuses.filter((s) => s === "Not Started").length,
      needsSupport: rows.filter((row) => staffWatchLabel(row.overallPercentage || 0, learningStatus({ percentage: row.overallPercentage || 0 })) === "Needs support").length,
    };
  }, [progress, teachers.length]);

  const saveAttendance = useMutation({
    mutationFn: async () => {
      const records = teachers
        .map((teacher: any) => ({
          teacherId: teacher.id,
          status: marks[teacher.id] || "present",
        }))
        .filter((row: { teacherId: string }) => row.teacherId);
      const res = await apiRequest("POST", `/api/batches/${batchId}/attendance`, {
        date: attendanceDate,
        records,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Register saved" });
      queryClient.invalidateQueries({ queryKey: ["/api/batches", batchId, "attendance", "summary"] });
    },
    onError: () => toast({ title: "Could not save attendance", variant: "destructive" }),
  });

  const announce = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/batches/${batchId}/announce`, {
        title: announceTitle,
        message: announceMessage,
      });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: `Announcement sent to ${data.sent || 0} teachers` });
      setAnnounceTitle("");
      setAnnounceMessage("");
      queryClient.invalidateQueries({ queryKey: ["/api/batches", batchId, "announcements"] });
    },
    onError: () => toast({ title: "Could not send announcement", variant: "destructive" }),
  });

  const importCsv = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/batches/${batchId}/teachers/import-csv`, { csv: csvText });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: `Imported ${data.enrolled || 0} people (${data.created || 0} new)` });
      queryClient.invalidateQueries({ queryKey: ["/api/batches", batchId] });
    },
    onError: () => toast({ title: "Could not import roster", variant: "destructive" }),
  });

  const createWork = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/batches/${batchId}/assignments`, {
        title: workTitle,
        instructions: workInstructions,
        dueDate: workDue || null,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Written work assigned" });
      setWorkTitle("");
      setWorkInstructions("");
      setWorkDue("");
      queryClient.invalidateQueries({ queryKey: ["/api/batches", batchId, "assignments"] });
    },
    onError: () => toast({ title: "Could not assign work", variant: "destructive" }),
  });

  const createEvent = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/batches/${batchId}/events`, {
        title: eventTitle,
        eventType,
        startDate: eventStart,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Added to the calendar" });
      setEventTitle("");
      setEventStart("");
      queryClient.invalidateQueries({ queryKey: ["/api/batches", batchId, "events"] });
    },
    onError: () => toast({ title: "Could not add event", variant: "destructive" }),
  });

  const markWork = useMutation({
    mutationFn: async (payload: { teacherId: string; trainerScore: string; trainerComment: string }) => {
      const res = await apiRequest(
        "PATCH",
        `/api/batches/${batchId}/assignments/${openWorkId}/submissions/${payload.teacherId}`,
        {
          trainerScore: payload.trainerScore === "" ? null : Number(payload.trainerScore),
          trainerComment: payload.trainerComment,
        },
      );
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Feedback saved" });
      queryClient.invalidateQueries({ queryKey: ["/api/batches", batchId, "assignments", openWorkId, "submissions"] });
    },
    onError: () => toast({ title: "Could not save feedback", variant: "destructive" }),
  });

  return (
    <div className="sl-page sl-bg-lamp min-h-screen">
      <header className="sticky top-0 z-50 bg-primary shadow-md">
        <div className="container mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Button variant="ghost" className="text-white hover:bg-white/10" onClick={() => navigate("/")}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Home
            </Button>
            <img src={logoImage} alt="Silverleaf Academy" className="h-10 w-10 object-contain" />
            <div className="min-w-0">
              <p className="text-white font-semibold truncate">{isLoading ? "Cohort" : batch?.name || "Cohort"}</p>
              <p className="text-white/80 text-xs hidden sm:block">Silverleaf Academy</p>
            </div>
          </div>
        </div>
      </header>

      <div className="sl-sheet container mx-auto my-4 sm:my-6 p-4 sm:p-8 space-y-6">
        <p className="text-muted-foreground sl-rise">
          {batch?.description || "People, quizzes, the register, performance, and graduates — in one classroom."}
        </p>

        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <Stat label="People" value={overview.total} delay="sl-rise-delay-1" />
          <Stat label="Quizzes" value={quizzes.length + fileQuizzes.length} delay="sl-rise-delay-2" />
          <Stat label="On the register" value={Array.isArray(attendance) ? attendance.length : 0} delay="sl-rise-delay-3" />
          <Stat label="In progress" value={overview.inProgress} />
          <Stat label="Completed" value={overview.completed} />
          <Stat label="Needs support" value={overview.needsSupport} />
        </div>

        <Tabs defaultValue="people">
          <TabsList className="flex flex-wrap h-auto">
            <TabsTrigger value="people"><Users className="h-4 w-4 mr-2" />People</TabsTrigger>
            <TabsTrigger value="quizzes"><ClipboardCheck className="h-4 w-4 mr-2" />Quizzes</TabsTrigger>
            <TabsTrigger value="attendance"><Award className="h-4 w-4 mr-2" />Register</TabsTrigger>
            <TabsTrigger value="performance"><BarChart3 className="h-4 w-4 mr-2" />Gradebook</TabsTrigger>
            <TabsTrigger value="graduates"><GraduationCap className="h-4 w-4 mr-2" />Graduates</TabsTrigger>
            <TabsTrigger value="announce"><Megaphone className="h-4 w-4 mr-2" />Announce</TabsTrigger>
            <TabsTrigger value="calendar"><Calendar className="h-4 w-4 mr-2" />Calendar</TabsTrigger>
            <TabsTrigger value="work"><FileText className="h-4 w-4 mr-2" />Work</TabsTrigger>
            <TabsTrigger value="import"><Upload className="h-4 w-4 mr-2" />Import</TabsTrigger>
          </TabsList>

          <TabsContent value="people" className="space-y-3 mt-4">
            {teachers.length === 0 ? (
              <Empty text="No teachers enrolled in this cohort yet." />
            ) : teachers.map((teacher: any) => (
              <Card key={teacher.id} className="sl-rise border-l-4 border-l-primary">
                <CardHeader className="py-4">
                  <CardTitle className="text-base">{teacher.name}</CardTitle>
                  <CardDescription>{teacher.email} · Teacher ID {teacher.teacherId}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="quizzes" className="space-y-3 mt-4">
            {quizzes.length === 0 && fileQuizzes.length === 0 ? (
              <Empty text="No quizzes in this cohort yet. Assign a module quiz from the trainer workspace." />
            ) : (
              <>
                {quizzes.map((quiz: any) => (
                  <Card key={quiz.id} className="sl-rise">
                    <CardHeader className="py-4">
                      <div className="flex items-center justify-between gap-2">
                        <CardTitle className="text-base">{quiz.title || "Module quiz"}</CardTitle>
                        <Badge>{quiz.status || "ready"}</Badge>
                      </div>
                      <CardDescription>{quiz.description || "Module quiz for this cohort"}</CardDescription>
                    </CardHeader>
                  </Card>
                ))}
                {fileQuizzes.map((quiz: any) => (
                  <Card key={quiz.id || quiz.file_id || quiz.deckFileId} className="sl-rise">
                    <CardHeader className="py-4">
                      <CardTitle className="text-base">{quiz.file_name || quiz.fileName || "Slide quiz"}</CardTitle>
                      <CardDescription>Questions from the lesson slides</CardDescription>
                    </CardHeader>
                  </Card>
                ))}
              </>
            )}
          </TabsContent>

          <TabsContent value="attendance" className="space-y-4 mt-4">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <p className="text-sm font-medium mb-1">Date</p>
                <Input type="date" value={attendanceDate} onChange={(e) => setAttendanceDate(e.target.value)} />
              </div>
              <Button onClick={() => saveAttendance.mutate()} disabled={saveAttendance.isPending || teachers.length === 0}>
                {saveAttendance.isPending ? "Saving..." : "Save register"}
              </Button>
            </div>
            {teachers.length === 0 ? (
              <Empty text="Enroll teachers before taking the register." />
            ) : teachers.map((teacher: any) => (
              <Card key={teacher.id} className="sl-rise">
                <CardContent className="py-4 flex flex-wrap items-center justify-between gap-3">
                  <span className="font-medium">{teacher.name}</span>
                  <div className="flex gap-2">
                    {["present", "absent"].map((status) => (
                      <Button
                        key={status}
                        size="sm"
                        variant={(marks[teacher.id] || "present") === status ? "default" : "outline"}
                        onClick={() => setMarks((current) => ({ ...current, [teacher.id]: status }))}
                      >
                        {status === "present" ? "Here" : "Away"}
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
            {Array.isArray(attendance) && attendance.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Rates so far</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {attendance.map((row: any) => (
                    <div key={row.teacher_id} className="flex justify-between text-sm">
                      <span>{row.teacher_name}</span>
                      <span>{row.attendance_rate || 0}%</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="performance" className="space-y-3 mt-4">
            <div className="flex justify-end">
              <Button asChild variant="outline" size="sm">
                <a href={`/api/batches/${batchId}/gradebook.csv`} download>
                  Download gradebook CSV
                </a>
              </Button>
            </div>
            {progress.length === 0 ? (
              <Empty text="The gradebook fills in as teachers finish modules and quizzes." />
            ) : progress.map((row: any) => (
              <Card key={row.teacherId || row.id} className="sl-rise border-l-4 border-l-primary">
                <CardHeader className="py-4">
                  <CardTitle className="text-base">{row.name || row.teacherName}</CardTitle>
                  <CardDescription>
                    {row.overallPercentage ?? 0}% of the course
                    {row.reportCard?.averageScore != null ? ` · quiz average ${row.reportCard.averageScore}%` : ""}
                    {(() => {
                      const status = learningStatus({ percentage: row.overallPercentage || 0 });
                      const watch = staffWatchLabel(row.overallPercentage || 0, status);
                      return ` · ${status}${watch ? ` · ${watch}` : ""}`;
                    })()}
                  </CardDescription>
                </CardHeader>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="graduates" className="space-y-3 mt-4">
            {certificates.length === 0 ? (
              <Card className="sl-rise">
                <CardHeader>
                  <CardTitle>No graduates yet</CardTitle>
                  <CardDescription>
                    Certificates appear after a teacher completes the assigned course. Nobody is missing from the system — this cohort simply has not certified anyone.
                  </CardDescription>
                </CardHeader>
                {closeToGraduate.length > 0 && (
                  <CardContent>
                    <p className="text-sm font-medium mb-2">Closest to graduating</p>
                    {closeToGraduate.map((row: any) => (
                      <p key={row.teacherId} className="text-sm text-muted-foreground">
                        {row.name} · {row.overallPercentage}%
                      </p>
                    ))}
                  </CardContent>
                )}
              </Card>
            ) : certificates.map((cert: any) => (
              <Card key={cert.id}>
                <CardHeader className="py-4">
                  <CardTitle className="text-base">{cert.teacherName || cert.name || "Graduate"}</CardTitle>
                  <CardDescription>{cert.status || "issued"}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="calendar" className="space-y-3 mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Schedule a session or deadline</CardTitle>
                <CardDescription>Teachers see this on their dashboard calendar.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Input placeholder="Title" value={eventTitle} onChange={(e) => setEventTitle(e.target.value)} />
                <select className="border rounded-md h-10 px-3 bg-background" value={eventType} onChange={(e) => setEventType(e.target.value)}>
                  <option value="session">Session</option>
                  <option value="deadline">Deadline</option>
                  <option value="assessment">Assessment</option>
                  <option value="general">General</option>
                </select>
                <Input type="datetime-local" value={eventStart} onChange={(e) => setEventStart(e.target.value)} />
                <Button disabled={!eventTitle.trim() || !eventStart || createEvent.isPending} onClick={() => createEvent.mutate()}>
                  Add to calendar
                </Button>
              </CardContent>
            </Card>
            {events.length === 0 ? (
              <Empty text="Nothing on the calendar yet." />
            ) : events.map((event: any) => (
              <Card key={event.id} className="sl-rise">
                <CardHeader className="py-4">
                  <CardTitle className="text-base">{event.title}</CardTitle>
                  <CardDescription>
                    {event.eventType} · {event.startDate ? new Date(event.startDate).toLocaleString() : ""}
                  </CardDescription>
                </CardHeader>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="work" className="space-y-3 mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Assign written work</CardTitle>
                <CardDescription>Besides quizzes — essays, lesson plans, reflections with a due date.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Input placeholder="Title" value={workTitle} onChange={(e) => setWorkTitle(e.target.value)} />
                <Textarea placeholder="Instructions" value={workInstructions} onChange={(e) => setWorkInstructions(e.target.value)} />
                <Input type="datetime-local" value={workDue} onChange={(e) => setWorkDue(e.target.value)} />
                <Button disabled={!workTitle.trim() || !workInstructions.trim() || createWork.isPending} onClick={() => createWork.mutate()}>
                  Assign work
                </Button>
              </CardContent>
            </Card>
            {assignments.length === 0 ? (
              <Empty text="No written assignments in this cohort yet." />
            ) : assignments.map((item: any) => (
              <Card key={item.id} className="sl-rise">
                <CardHeader className="py-4">
                  <CardTitle className="text-base">{item.title}</CardTitle>
                  <CardDescription>
                    {item.dueDate ? `Due ${new Date(item.dueDate).toLocaleString()}` : "No due date"}
                  </CardDescription>
                  <Button
                    size="sm"
                    variant={openWorkId === item.id ? "default" : "outline"}
                    onClick={() => setOpenWorkId(openWorkId === item.id ? null : item.id)}
                  >
                    {openWorkId === item.id ? "Hide submissions" : "Mark submissions"}
                  </Button>
                </CardHeader>
                {openWorkId === item.id && (
                  <CardContent className="space-y-4">
                    {submissions.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No submissions yet.</p>
                    ) : submissions.map((row: any) => {
                      const teacherId = row.teacher_id || row.teacherId;
                      const draft = markDrafts[teacherId] || {
                        score: row.trainer_score ?? row.trainerScore ?? "",
                        comment: row.trainer_comment || row.trainerComment || "",
                      };
                      return (
                        <div key={row.id} className="space-y-2 border-t pt-3">
                          <p className="font-medium">{row.teacher_name || row.teacherName}</p>
                          <p className="text-sm text-muted-foreground">{row.response}</p>
                          <div className="flex flex-wrap gap-2">
                            <Input
                              className="w-24"
                              type="number"
                              min={0}
                              max={100}
                              placeholder="Score"
                              value={draft.score}
                              onChange={(e) => setMarkDrafts((current) => ({
                                ...current,
                                [teacherId]: { ...draft, score: e.target.value },
                              }))}
                            />
                            <Input
                              className="flex-1 min-w-[180px]"
                              placeholder="Comment / rubric note"
                              value={draft.comment}
                              onChange={(e) => setMarkDrafts((current) => ({
                                ...current,
                                [teacherId]: { ...draft, comment: e.target.value },
                              }))}
                            />
                            <Button
                              size="sm"
                              disabled={markWork.isPending}
                              onClick={() => markWork.mutate({
                                teacherId,
                                trainerScore: String(draft.score),
                                trainerComment: draft.comment,
                              })}
                            >
                              Save mark
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                )}
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="import" className="space-y-3 mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Import a class roster</CardTitle>
                <CardDescription>CSV with name, email, and optional password. Existing emails are enrolled; new teachers get Teacher123! if password is blank.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea rows={8} value={csvText} onChange={(e) => setCsvText(e.target.value)} />
                <Button disabled={importCsv.isPending} onClick={() => importCsv.mutate()}>
                  Import roster
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="announce" className="space-y-3 mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Pin a note to this cohort</CardTitle>
                <CardDescription>Every enrolled teacher gets it in their bell. Email is sent when RESEND_API_KEY is configured.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Input placeholder="Title" value={announceTitle} onChange={(e) => setAnnounceTitle(e.target.value)} />
                <Textarea placeholder="What should they know?" value={announceMessage} onChange={(e) => setAnnounceMessage(e.target.value)} />
                <Button
                  disabled={!announceTitle.trim() || !announceMessage.trim() || announce.isPending}
                  onClick={() => announce.mutate()}
                >
                  Send to class
                </Button>
              </CardContent>
            </Card>
            {announcements.length === 0 ? (
              <Empty text="No announcements sent yet." />
            ) : announcements.map((item: any, index: number) => (
              <Card key={`${item.title}-${index}`} className="sl-rise">
                <CardHeader className="py-4">
                  <CardTitle className="text-base">{item.title}</CardTitle>
                  <CardDescription>
                    {item.recipients || 0} teachers · {item.created_at ? new Date(item.created_at).toLocaleString() : ""}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm">{item.message}</p>
                </CardContent>
              </Card>
            ))}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function Stat({ label, value, delay = "" }: { label: string; value: number; delay?: string }) {
  return (
    <Card className={`p-4 sl-rise ${delay}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold mt-1">{value}</p>
    </Card>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-sm text-muted-foreground py-8">{text}</p>;
}
