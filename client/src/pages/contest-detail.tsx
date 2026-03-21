import { useParams } from "wouter";
import Layout from "@/components/layout";
import { useContest, useJoinContest, useSubmitContestProblem, useContestLeaderboard } from "@/hooks/use-contests";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, ExternalLink, Trophy, Clock, CheckCircle } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function ContestDetail() {
  const params = useParams();
  const contestId = parseInt(params.id || "0");
  const { user } = useAuth();
  
  const { data: contest, isLoading } = useContest(contestId);
  const { data: leaderboard } = useContestLeaderboard(contestId);
  const joinMutation = useJoinContest();
  const submitMutation = useSubmitContestProblem();

  if (isLoading) {
    return (
      <Layout>
        <div className="h-[50vh] flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </Layout>
    );
  }

  if (!contest) {
    return (
      <Layout>
        <div className="p-8 text-center text-muted-foreground">Contest not found</div>
      </Layout>
    );
  }

  const isParticipant = contest.participants?.some((p: any) => p.userId === user?.id);

  return (
    <Layout>
      <div className="space-y-6 animate-in fade-in duration-500">
        <div className="flex flex-col md:flex-row justify-between md:items-start gap-4">
          <div>
            <div className="flex items-center gap-3">
               <h1 className="text-3xl font-bold tracking-tight">{contest.title}</h1>
               <span className="px-3 py-1 bg-primary/20 text-primary text-sm font-semibold rounded-full uppercase">{contest.type}</span>
            </div>
            <p className="text-muted-foreground mt-2">{contest.description || `Prepare yourself for the ${contest.type} contest.`}</p>
          </div>
          {!isParticipant && (
            <Button size="lg" onClick={() => joinMutation.mutate(contestId)} disabled={joinMutation.isPending}>
              {joinMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Join Contest
            </Button>
          )}
          {isParticipant && (
            <div className="flex items-center gap-2 text-green-600 bg-green-500/10 px-4 py-2 rounded-lg font-medium">
               <CheckCircle className="w-5 h-5" /> Registered
            </div>
          )}
        </div>

        <Tabs defaultValue="problems" className="w-full">
          <TabsList>
            <TabsTrigger value="problems">Problems</TabsTrigger>
            <TabsTrigger value="standings" className="flex items-center gap-2">
              <Trophy className="w-4 h-4" /> Standings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="problems" className="mt-6 space-y-4">
            {!isParticipant ? (
              <Card>
                <CardContent className="p-12 text-center text-muted-foreground flex flex-col items-center">
                  <Clock className="w-12 h-12 mb-4 opacity-50" />
                  <p className="text-lg">You must join the contest to view problems and submit solutions.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {contest.problems?.map((problem: any) => (
                  <Card key={problem.id}>
                    <CardHeader className="py-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <CardTitle className="text-lg flex items-center gap-3">
                          <span className="w-8 h-8 rounded bg-primary/10 text-primary flex items-center justify-center font-bold">
                            {problem.order}
                          </span>
                          {problem.title}
                          <span className="text-sm font-normal text-muted-foreground bg-muted px-2 py-1 rounded">
                            {problem.platform}
                          </span>
                          <span className="text-sm font-semibold text-orange-500">
                            {problem.points} pts
                          </span>
                        </CardTitle>
                        
                        <div className="flex items-center gap-4">
                          <Button variant="outline" size="sm" asChild>
                            <a href={problem.link} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="w-4 h-4 mr-2" /> Solve
                            </a>
                          </Button>
                          
                          <Select 
                            onValueChange={(val) => submitMutation.mutate({ contestId, problemId: problem.id, status: val })}
                            disabled={submitMutation.isPending}
                          >
                            <SelectTrigger className="w-[140px]">
                              <SelectValue placeholder="Mark Status" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Solved">Solved</SelectItem>
                              <SelectItem value="Attempted">Attempted</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </CardHeader>
                  </Card>
                ))}
                
                {(!contest.problems || contest.problems.length === 0) && (
                  <Card>
                     <CardContent className="p-8 text-center text-muted-foreground">
                        <p>No problems have been added to this contest yet.</p>
                     </CardContent>
                  </Card>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="standings" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Live Leaderboard</CardTitle>
                <CardDescription>Real-time scores from all participants. First to solve claims the points!</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[100px]">Rank</TableHead>
                      <TableHead>Participant</TableHead>
                      <TableHead className="text-right">Score</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leaderboard?.map((participant: any, index: number) => (
                      <TableRow key={participant.id}>
                        <TableCell className="font-medium text-muted-foreground">
                           {index === 0 ? <Trophy className="w-5 h-5 text-yellow-500" /> : `#${index + 1}`}
                        </TableCell>
                        <TableCell className="font-semibold text-lg">{participant.user.username}</TableCell>
                        <TableCell className="text-right font-bold text-primary text-lg">{participant.score}</TableCell>
                      </TableRow>
                    ))}
                    {leaderboard?.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                          No score entries yet. Check back soon.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
