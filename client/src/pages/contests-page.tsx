import { useState } from "react";
import { Link } from "wouter";
import Layout from "@/components/layout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useContests, useCreateContest, useBlitzQueue } from "@/hooks/use-contests";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Loader2, Plus, Swords, Timer, Users, Calendar } from "lucide-react";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export default function ContestsPage() {
  const { user } = useAuth();
  return (
    <Layout>
      <div className="space-y-8 animate-in fade-in duration-500">
         <div className="flex justify-between items-center">
            <div>
              <h2 className="text-3xl font-bold tracking-tight">Contests Arena</h2>
              <p className="text-muted-foreground mt-2">Compete, practice, and track your global standing.</p>
            </div>
         </div>
         <Tabs defaultValue="club" className="w-full">
           <TabsList className="grid w-full max-w-md grid-cols-3">
             <TabsTrigger value="club">Club</TabsTrigger>
             <TabsTrigger value="blitz">Blitz 1v1</TabsTrigger>
             <TabsTrigger value="practice">Practice</TabsTrigger>
           </TabsList>
           
           <TabsContent value="club" className="mt-6">
              <ClubContestsTab isMentor={user?.role === "mentor"} />
           </TabsContent>
           
           <TabsContent value="blitz" className="mt-6">
              <BlitzTab />
           </TabsContent>
           
           <TabsContent value="practice" className="mt-6">
              <PracticeTab />
           </TabsContent>
         </Tabs>
      </div>
    </Layout>
  );
}

function ClubContestsTab({ isMentor }: { isMentor: boolean }) {
  const { data: contests, isLoading } = useContests('club');
  
  if (isLoading) return <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />;

  return (
    <div className="space-y-4">
      {isMentor && (
        <CreateContestModal type="club" title="Create Club Contest" description="Host a competitive event for your club students." />
      )}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mt-4">
        {contests?.map((contest: any) => (
          <ContestCard key={contest.id} contest={contest} icon={<Users className="w-5 h-5 text-primary" />} />
        ))}
        {contests?.length === 0 && <p className="text-muted-foreground">No active club contests right now.</p>}
      </div>
    </div>
  );
}

function BlitzTab() {
  const { data: contests, isLoading } = useContests('blitz');
  const queueMutation = useBlitzQueue();
  
  return (
    <div className="space-y-6">
      <Card className="bg-gradient-to-r from-red-500/10 to-orange-500/10 border-red-500/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-500"><Swords className="w-6 h-6" /> Enter the Blitz Arena</CardTitle>
          <CardDescription>Match up against a random player in a race to solve a problem first.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => queueMutation.mutate()} disabled={queueMutation.isPending} size="lg" className="w-full sm:w-auto bg-red-600 hover:bg-red-700">
            {queueMutation.isPending ? <Loader2 className="mr-2 w-4 h-4 animate-spin" /> : <Swords className="mr-2 w-4 h-4" />}
            Find 1v1 Match
          </Button>
        </CardContent>
      </Card>

      <h3 className="text-lg font-semibold mt-8">Active & Past Matches</h3>
      {isLoading ? (
        <Loader2 className="w-6 h-6 flex animate-spin mx-auto text-muted-foreground" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {contests?.map((contest: any) => (
             <ContestCard key={contest.id} contest={contest} icon={<Swords className="w-5 h-5 text-red-500" />} />
          ))}
          {contests?.length === 0 && <p className="text-muted-foreground">No matches played yet.</p>}
        </div>
      )}
    </div>
  );
}

function PracticeTab() {
  const { data: contests, isLoading } = useContests('practice');
  
  return (
    <div className="space-y-4">
      <CreateContestModal type="practice" title="New Practice Contest" description="Start a personal timer-based practice session with your own problems." />
      
      {isLoading ? (
        <Loader2 className="w-6 h-6 flex animate-spin mx-auto text-muted-foreground" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mt-4">
          {contests?.map((contest: any) => (
             <ContestCard key={contest.id} contest={contest} icon={<Timer className="w-5 h-5 text-green-500" />} />
          ))}
          {contests?.length === 0 && <p className="text-muted-foreground">Create your first practice contest.</p>}
        </div>
      )}
    </div>
  );
}

function ContestCard({ contest, icon }: { contest: any, icon: React.ReactNode }) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader>
        <div className="flex justify-between items-start">
          <CardTitle className="text-xl flex gap-2 items-center">
            {icon} {contest.title}
          </CardTitle>
          <span className="text-xs font-semibold px-2 py-1 rounded bg-muted text-muted-foreground uppercase">
            {contest.status}
          </span>
        </div>
        <CardDescription>{contest.description || "No description provided."}</CardDescription>
      </CardHeader>
      <CardContent>
         <div className="flex items-center text-sm text-muted-foreground gap-2">
           <Calendar className="w-4 h-4" />
           {format(new Date(contest.createdAt), 'MMM d, yyyy h:mm a')}
         </div>
      </CardContent>
      <CardFooter>
        <Button asChild variant="secondary" className="w-full">
           <Link href={`/contests/${contest.id}`}>View Details</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}

function CreateContestModal({ type, title, description }: { type: string, title: string, description: string }) {
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState({ title: '', description: '' });
  const [problemUrl, setProblemUrl] = useState('');
  const createMutation = useCreateContest();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Minimal parser to attach 1 initial problem if link is provided.
    // Future iteration can attach an array of problems.
    let problems = [] as any[];
    if (problemUrl.trim().length > 0) {
      problems.push({
         title: "Contest Problem A",
         link: problemUrl,
         platform: problemUrl.includes("codeforces") ? "Codeforces" : "Other",
         order: "A",
         points: 100
      });
    }

    createMutation.mutate(
      { ...formData, type, problems },
      { onSuccess: () => {
         setOpen(false);
         setFormData({ title: '', description: '' });
         setProblemUrl('');
      } }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="w-full sm:w-auto"><Plus className="w-4 h-4 mr-2" /> {title}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Contest Title</label>
            <Input required value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} placeholder="e.g Weekly Masterclass" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Description</label>
            <Textarea value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} placeholder="Details about this contest..." />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Initial Problem Link (Optional)</label>
            <Input value={problemUrl} onChange={e => setProblemUrl(e.target.value)} placeholder="https://codeforces.com/problemset/problem/..." />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
