import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AcademyShell } from "@/components/AcademyShell";
import { DeskMail } from "@/components/DeskMail";
import { filterByQuery, ListSearch, PageStrip, usePager } from "@/components/PageStrip";
import { SkeletonRows } from "@/components/Skeletons";
import { useAuth } from "@/hooks/use-auth";
import { deskName } from "@shared/deskName";

type Peer = { id: string; name: string; role: string };

/** One group of people to write to, paged so a long list of Fellows leaves the thread in reach. */
function PeerGroup({ title, people, selectedId, onPick }: { title: string; people: Peer[]; selectedId?: string; onPick: (id: string) => void }) {
  const pager = usePager(people, 8);
  if (people.length === 0) return null;
  return (
    <div className="space-y-1" data-testid={`peer-group-${title.toLowerCase()}`}>
      <h3 className="text-sm font-normal text-sl-muted">{title}</h3>
      <ul className="space-y-2">
        {pager.slice.map((person) => (
          <li key={person.id}>
            <button
              type="button"
              onClick={() => onPick(person.id)}
              aria-current={person.id === selectedId ? "true" : undefined}
              className={`min-h-11 w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-sl-ink ${person.id === selectedId ? "bg-sl-accent-soft" : "hover:bg-sl-neutral-soft"}`}
              data-testid={`button-mail-${person.id}`}
            >
              {person.name}
            </button>
          </li>
        ))}
      </ul>
      <PageStrip page={pager.page} pages={pager.pages} setPage={pager.setPage} />
    </div>
  );
}

/** The Admin's desk mail with Trainers and Fellows. */
export default function AdminMessages() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data: peers = [], isLoading, isError } = useQuery<Peer[]>({ queryKey: ["/api/admin/desk-peers"] });

  const found = filterByQuery(peers, search, (person) => person.name);
  const peer = peers.find((person) => person.id === selectedId) || peers[0] || null;

  return (
    <AcademyShell title="Messages" desk="admin" current="messages">
      <h1 className="text-[28px] font-semibold text-sl-ink">Messages</h1>
      <p className="mb-5 text-sm text-sl-muted">Private desk mail with one Trainer or Fellow. They can answer you here.</p>
      <div className="grid gap-5 lg:grid-cols-[minmax(15rem,1fr)_minmax(0,2fr)] lg:items-stretch">
        <section className="space-y-4 rounded-xl border border-sl-line bg-sl-surface p-5" aria-label="People to write to" data-testid="admin-mail-people">
          <ListSearch value={search} onChange={setSearch} placeholder="Search by name" />
          {isLoading ? (
            <SkeletonRows label="Loading people" rows={4} className="-mx-5" />
          ) : isError ? (
            <p className="text-sm text-sl-muted">Could not load the people. Refresh the page to try again.</p>
          ) : peers.length === 0 ? (
            <p className="text-sm text-sl-muted">No approved Trainers or Fellows yet.</p>
          ) : found.length === 0 ? (
            <p className="text-sm text-sl-muted">No one by that name.</p>
          ) : (
            <>
              <PeerGroup title="Trainers" people={found.filter((person) => person.role === "trainer")} selectedId={peer?.id} onPick={setSelectedId} />
              <PeerGroup title="Fellows" people={found.filter((person) => person.role === "teacher")} selectedId={peer?.id} onPick={setSelectedId} />
            </>
          )}
        </section>
        <div className="min-w-0 [&>*]:h-full [&>*]:max-w-none">
          {/* Keyed, so a half-written note never carries over to the next person. */}
          <DeskMail key={peer?.id ?? "none"} peer={peer} selfLabel={user ? deskName(user) : "Admin"} loading={isLoading} />
        </div>
      </div>
    </AcademyShell>
  );
}
