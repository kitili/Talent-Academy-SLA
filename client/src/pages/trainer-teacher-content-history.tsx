import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  ArrowLeft, 
  CheckCircle, 
  XCircle,
  FileText,
  RotateCcw,
  AlertCircle
} from "lucide-react";

export default function TrainerTeacherContentHistory() {
  const { teacherId, weekId } = useParams();
  const [, setLocation] = useLocation();
  const [selectedItem, setSelectedItem] = useState<any>(null);

  const { data: historyData = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/trainers/teachers", teacherId, "weeks", weekId, "content-history"],
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="text-lg font-medium">Loading history...</div>
        </div>
      </div>
    );
  }

  // Set first item as selected by default
  const firstItem = historyData.length > 0 ? historyData[0] : null;
  const displayItem = selectedItem || firstItem;

  const hasAttempts = displayItem?.attempts && displayItem.attempts.length > 0;
  const hasRegenerations = displayItem?.regenerations && displayItem.regenerations.length > 0;
  const status = displayItem?.progress?.status || "not started";
  const isCompleted = status === "completed";

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setLocation("/trainer/batches")}
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold" data-testid="text-page-title">
              Teacher Content History
            </h1>
            <p className="text-muted-foreground">
              View all attempts, regenerations, and progress
            </p>
          </div>
        </div>

        {/* Two-Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-[calc(100vh-250px)]">
          {/* Left Sidebar - History List */}
          <div className="lg:col-span-1 border rounded-lg bg-card overflow-hidden flex flex-col">
            <div className="p-4 border-b">
              <h3 className="font-semibold">Content Items</h3>
              <p className="text-xs text-muted-foreground mt-1">{historyData.length} total</p>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-2">
                {historyData.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    <AlertCircle className="mx-auto h-8 w-8 mb-2 opacity-50" />
                    No content found
                  </div>
                ) : (
                  historyData.map((item: any, index: number) => {
                    const itemStatus = item.progress?.status || "not started";
                    const isSelected = selectedItem?.file?.id === item.file?.id;
                    return (
                      <button
                        key={index}
                        onClick={() => setSelectedItem(item)}
                        className={`w-full text-left p-3 rounded-lg transition-colors border text-sm ${
                          isSelected
                            ? "bg-primary/10 border-primary"
                            : "bg-muted/30 border-transparent hover:bg-muted/50"
                        }`}
                        data-testid={`button-history-item-${index}`}
                      >
                        <div className="flex items-start gap-2">
                          <FileText className="h-4 w-4 flex-shrink-0 mt-0.5" />
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold truncate text-xs">{item.file?.title || "Unknown"}</p>
                            <p className="text-xs text-muted-foreground capitalize mt-1">
                              {itemStatus}
                            </p>
                          </div>
                          {itemStatus === "completed" && (
                            <CheckCircle className="h-3 w-3 text-green-500 flex-shrink-0" />
                          )}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Right Panel - Details */}
          {displayItem ? (
            <div className="lg:col-span-3 border rounded-lg bg-card overflow-hidden flex flex-col">
              {/* Header */}
              <div className="p-4 border-b sticky top-0 z-10 bg-card">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-bold flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      {displayItem.file?.title || "Unknown Content"}
                    </h2>
                    <p className="text-sm text-muted-foreground mt-1 capitalize">
                      {displayItem.file?.type || "file"} - Status: {status}
                    </p>
                  </div>
                  {isCompleted && (
                    <Badge variant="default" className="gap-1">
                      <CheckCircle className="h-3 w-3" />
                      Completed
                    </Badge>
                  )}
                </div>
              </div>

              {/* Content */}
              <ScrollArea className="flex-1">
                <div className="p-4 space-y-6">
                  {/* Progress Information */}
                  {displayItem.progress && (
                    <div className="bg-muted/50 p-4 rounded-lg space-y-2">
                      <h3 className="font-semibold text-sm">Progress Details</h3>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Status:</span>
                        <Badge variant="outline" className="capitalize">{displayItem.progress.status}</Badge>
                      </div>
                      {displayItem.progress.viewedAt && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">Viewed At:</span>
                          <span className="text-sm">{new Date(displayItem.progress.viewedAt).toLocaleString()}</span>
                        </div>
                      )}
                      {displayItem.progress.completedAt && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">Completed At:</span>
                          <span className="text-sm">{new Date(displayItem.progress.completedAt).toLocaleString()}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Quiz Attempts */}
                  {hasAttempts && (
                    <div className="space-y-3">
                      <h3 className="text-lg font-semibold flex items-center gap-2">
                        <FileText className="h-5 w-5" />
                        Quiz Attempts ({displayItem.attempts.length})
                      </h3>
                      <div className="space-y-3">
                        {displayItem.attempts.map((attempt: any) => {
                          const percentage = Math.round((attempt.score / attempt.totalQuestions) * 100);
                          const passed = attempt.passed === "yes";
                          
                          return (
                            <Card 
                              key={attempt.id}
                              className="border-l-4"
                              style={{
                                borderLeftColor: passed ? '#22c55e' : '#ef4444'
                              }}
                              data-testid={`card-attempt-${attempt.id}`}
                            >
                              <CardHeader>
                                <div className="flex items-center justify-between">
                                  <div>
                                    <CardTitle className="text-base">
                                      Attempt {attempt.attemptNumber}
                                    </CardTitle>
                                    <CardDescription>
                                      {new Date(attempt.completedAt).toLocaleString()}
                                    </CardDescription>
                                  </div>
                                  <Badge variant={passed ? "default" : "destructive"} className="gap-1">
                                    {passed ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                                    {percentage}%
                                  </Badge>
                                </div>
                              </CardHeader>
                              <CardContent>
                                <div className="grid grid-cols-2 gap-4 text-sm">
                                  <div>
                                    <span className="text-muted-foreground">Score:</span>
                                    <span className="ml-2 font-semibold">{attempt.score}/{attempt.totalQuestions}</span>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">Result:</span>
                                    <span className="ml-2 font-semibold">{passed ? "Passed" : "Failed"}</span>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Quiz Regenerations */}
                  {hasRegenerations && (
                    <div className="space-y-3">
                      <h3 className="text-lg font-semibold flex items-center gap-2">
                        <RotateCcw className="h-5 w-5" />
                        Quiz Regenerations ({displayItem.regenerations.length})
                      </h3>
                      <div className="space-y-3">
                        {displayItem.regenerations.map((regen: any) => (
                          <Card 
                            key={regen.id} 
                            className="border-l-4"
                            style={{ borderLeftColor: '#f97316' }}
                            data-testid={`card-regen-${regen.id}`}
                          >
                            <CardHeader>
                              <div className="flex items-center justify-between">
                                <div>
                                  <CardTitle className="text-base flex items-center gap-2">
                                    <RotateCcw className="h-4 w-4" />
                                    Quiz Regenerated
                                  </CardTitle>
                                  <CardDescription>
                                    {new Date(regen.regeneratedAt).toLocaleString()}
                                  </CardDescription>
                                </div>
                                <Badge variant="outline">
                                  After {regen.failedAttempts || 3} Failures
                                </Badge>
                              </div>
                            </CardHeader>
                            <CardContent>
                              <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                  <span className="text-muted-foreground">Previous Quiz:</span>
                                  <span className="ml-2 font-mono text-xs">{regen.previousQuizGenerationId?.slice(0, 8)}...</span>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">New Quiz:</span>
                                  <span className="ml-2 font-mono text-xs">{regen.newQuizGenerationId?.slice(0, 8)}...</span>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>
                  )}

                  {!hasAttempts && !hasRegenerations && (
                    <div className="bg-muted/30 p-6 rounded-lg text-center">
                      <AlertCircle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                      <p className="text-muted-foreground">
                        No quiz attempts or regenerations yet
                      </p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          ) : (
            <div className="lg:col-span-3 border rounded-lg bg-card flex items-center justify-center">
              <div className="text-center">
                <AlertCircle className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
                <p className="text-muted-foreground">No content data available</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
