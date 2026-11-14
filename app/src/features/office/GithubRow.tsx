/* The GitHub row on the health board (spec-ux-G2 §2b–2f). Published is the normal state: the repo link,
   the Private/Public switch (going public asks first, inline; going private doesn't) and the last push.
   Not published: "Publish to GitHub…" opens an inline two-press form (name + visibility → one confirm
   sentence), or the how-to hint when the GitHub CLI isn't ready. No sheet: the board is already a layer. */
import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import { invalidate, setQueryData, useQuery } from '../../api/query';
import { studio } from '../../api/studio';
import type { GithubView, GitStatus, ProjectHealth } from '../../api/types';
import { Button, Switch, toast } from '../../ui';
import { keys } from './api';
import { ghHint, ghRowState, publishError, publishSentence, REPO_NAME } from './github';

type Mode = 'idle' | 'hint' | 'form' | 'confirm' | 'publishing' | 'go-public';

export function GithubRow({
  pid,
  name,
  folder,
  health,
}: {
  pid: string;
  name: string;
  folder: string | null;
  health: ProjectHealth | undefined;
}) {
  const gh = useQuery('gh:status', studio.ghStatus);
  const view = health?.github;
  const git: GitStatus | undefined = health?.latest?.git ?? health?.git;
  const st = ghRowState(view, health?.git ?? git, gh.data);
  const [mode, setMode] = useState<Mode>('idle');
  const [repoName, setRepoName] = useState(folder?.split('/').at(-1) ?? '');
  const [pub, setPub] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | 'public' | 'private' | 'push'>(null);
  const [live, setLive] = useState('');
  const opener = useRef<HTMLButtonElement | null>(null);
  const li = useRef<HTMLLIElement>(null);
  const area = useRef<HTMLDivElement>(null);
  const uid = useId();

  /* focus: into the inline area when it opens (Name, or the confirm's safe button), back to the opener when it closes */
  useEffect(() => {
    if (mode === 'idle' || mode === 'publishing') return;
    const sel =
      mode === 'form'
        ? 'input'
        : mode === 'go-public'
          ? '[data-safe]'
          : mode === 'confirm'
            ? '[data-go]'
            : 'button';
    area.current?.querySelector<HTMLElement>(sel)?.focus();
  }, [mode]);
  const close = () => {
    setMode('idle');
    setTimeout(() => opener.current?.focus(), 0);
  };
  const onEsc = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    if (mode === 'confirm') setMode('form');
    else close();
  };

  const putView = (v: GithubView) => {
    setQueryData<ProjectHealth>(keys.health(pid), (h) =>
      h ? { ...h, github: v } : (h as unknown as ProjectHealth),
    );
    void invalidate(keys.health(pid));
    void invalidate('projects');
  };

  async function openPublish(e: React.MouseEvent<HTMLButtonElement>) {
    opener.current = e.currentTarget;
    setErr(null);
    setMode(gh.data?.gh === 'ready' ? 'form' : 'hint');
  }
  async function checkAgain() {
    await gh.refetch();
  }
  /* the hint turns into the form as soon as gh is ready */
  useEffect(() => {
    if (mode === 'hint' && gh.data?.gh === 'ready') setMode('form');
  }, [mode, gh.data]);

  async function publish() {
    setMode('publishing');
    setErr(null);
    setLive('Publishing… creating the repo');
    try {
      const r = await studio.projects.publish(pid, {
        name: repoName,
        visibility: pub ? 'public' : 'private',
      });
      putView(r);
      setMode('idle');
      if (r.pushed) {
        toast(`🚀 ${name} is on GitHub — ${pub ? 'public' : 'private'}`);
        setLive(`Published — ${pub ? 'public' : 'private'}`);
      } else {
        setErr('The repo is ready but main didn’t push — Try again.');
        setLive('Published, but the first push didn’t go through');
      }
    } catch (e) {
      setErr(publishError(e, repoName));
      setLive('');
      setMode('form');
    }
  }

  async function setVisibility(next: 'public' | 'private') {
    setBusy(next);
    setErr(null);
    setMode('idle');
    try {
      putView(await studio.projects.setVisibility(pid, next));
      if (next === 'private') toast(`🔒 ${st.kind === 'published' ? st.name : name} is private`);
      else toast(`🌐 ${st.kind === 'published' ? st.name : name} is public`);
      setLive(next === 'public' ? 'Now public' : 'Now private');
    } catch {
      setErr(`GitHub didn’t change it — still ${next === 'public' ? 'private' : 'public'}.`);
    } finally {
      setBusy(null);
      setTimeout(() => opener.current?.focus(), 0);
    }
  }

  async function tryAgain() {
    setBusy('push');
    setErr(null);
    try {
      const v = await studio.projects.pushGithub(pid);
      putView(v);
      setLive(v.lastPush?.ok ? 'Pushed' : 'The push didn’t go through');
    } catch (e) {
      setErr(publishError(e, repoName));
    } finally {
      setBusy(null);
    }
  }

  const nameOk = REPO_NAME.test(repoName);
  const failNote =
    st.kind === 'published' && st.pushFailed && view?.lastPush?.note
      ? `GitHub said: ${view.lastPush.note.replace(/[.\s]+$/, '')}. Your work is safe locally.`
      : null;

  return (
    <li className="ob-gh" ref={li}>
      <div className="ob-gh-row">
        <span className="ob-pi" aria-hidden="true">
          ⎇
        </span>
        <b>GitHub</b>
        <span className="ob-pv">
          {st.kind === 'published' ? (
            <>
              <a href={st.url} target="_blank" rel="noreferrer" className="ob-applink">
                {st.repo} ↗
              </a>
              <span className="ob-gh-vis">
                <span className="ob-gh-word">
                  {busy === 'public'
                    ? 'Making public…'
                    : busy === 'private'
                      ? 'Making private…'
                      : st.public
                        ? 'Public'
                        : 'Private'}
                </span>
                <Switch
                  checked={st.public}
                  label="Public on GitHub"
                  disabled={!!busy || mode === 'go-public'}
                  onChange={(next) => {
                    opener.current =
                      li.current?.querySelector<HTMLButtonElement>('.ob-gh-vis .switch') ?? null;
                    if (next) setMode('go-public');
                    else void setVisibility('private');
                  }}
                />
              </span>
              <span className={st.pushFailed ? 'ob-gh-push warn' : 'ob-gh-push'}>
                {busy === 'push' ? 'pushing…' : st.push}
              </span>
            </>
          ) : st.kind === 'not-tracked' ? (
            <>
              <a href={st.url} target="_blank" rel="noreferrer" className="ob-applink">
                {st.repo} ↗
              </a>
              {st.text && <span className="ob-gh-push">{st.text}</span>}
            </>
          ) : mode === 'publishing' ? (
            'Publishing… creating the repo · pushing main'
          ) : (
            st.text
          )}
        </span>
        <span className="ob-app-acts">
          {st.kind === 'unpublished' && mode === 'idle' && (
            <Button small variant="ghost" onClick={openPublish}>
              Publish to GitHub…
            </Button>
          )}
          {st.kind === 'published' && st.pushFailed && (
            <Button small variant="ghost" disabled={busy === 'push'} onClick={() => void tryAgain()}>
              {busy === 'push' ? '…' : 'Try again'}
            </Button>
          )}
        </span>
      </div>
      <span className="sr-only" aria-live="polite">
        {live}
      </span>
      {failNote && !err && <p className="ob-gh-note">{failNote}</p>}
      {err && (
        <p className="ob-err" role="alert">
          {err}
        </p>
      )}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: Escape inside the inline area = Cancel / Back */}
      <div
        ref={area}
        className="ob-gh-more"
        onKeyDown={onEsc}
        hidden={mode === 'idle' || mode === 'publishing'}
      >
        {mode === 'hint' && gh.data && (
          <p className="ob-gh-hint">
            <span>{renderHint(ghHint(gh.data.gh) ?? '')}</span>
            <Button small variant="ghost" disabled={gh.fetching} onClick={() => void checkAgain()}>
              {gh.fetching ? 'Checking…' : 'Check again'}
            </Button>
            <Button small variant="ghost" onClick={close}>
              Cancel
            </Button>
          </p>
        )}
        {mode === 'form' && (
          <form
            className="ob-gh-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (nameOk) setMode('confirm');
            }}
          >
            <label htmlFor={`${uid}-n`}>Name</label>
            <span className="ob-gh-name">
              <span className="ob-gh-owner">github.com/{gh.data?.login ? `${gh.data.login}/` : ''}</span>
              <input
                id={`${uid}-n`}
                value={repoName}
                spellCheck={false}
                aria-invalid={!nameOk || undefined}
                aria-describedby={nameOk ? undefined : `${uid}-ne`}
                onChange={(e) => setRepoName(e.target.value.trim())}
              />
            </span>
            {!nameOk && (
              <span className="ob-gh-bad" id={`${uid}-ne`}>
                Use letters, numbers, - _ or . only
              </span>
            )}
            <span className="ob-gh-lab" id={`${uid}-v`}>
              Visibility
            </span>
            <span className="ob-gh-radios" role="radiogroup" aria-labelledby={`${uid}-v`}>
              <label>
                <input type="radio" name={`${uid}-vis`} checked={!pub} onChange={() => setPub(false)} />{' '}
                Private — only you
              </label>
              <label>
                <input type="radio" name={`${uid}-vis`} checked={pub} onChange={() => setPub(true)} /> Public
                — anyone can see the code
              </label>
            </span>
            <span className="ob-gh-btns">
              <Button small variant="hero" type="submit" disabled={!nameOk}>
                Continue
              </Button>
              <Button small variant="ghost" onClick={close}>
                Cancel
              </Button>
            </span>
          </form>
        )}
        {mode === 'confirm' && (
          <div className="ob-gh-confirm">
            <p>{publishSentence(gh.data?.login ?? null, repoName, pub, git?.commits ?? 0)}</p>
            <span className="ob-gh-btns">
              <Button small variant="hero" data-go onClick={() => void publish()}>
                {pub ? 'Publish publicly' : 'Publish'}
              </Button>
              <Button small variant="ghost" onClick={() => setMode('form')}>
                Back
              </Button>
            </span>
          </div>
        )}
        {mode === 'go-public' && st.kind === 'published' && (
          <div className="ob-gh-confirm">
            <p>Make {st.name} public? Anyone will see its code and full history.</p>
            <span className="ob-gh-btns">
              <Button small variant="hero" onClick={() => void setVisibility('public')}>
                Make public
              </Button>
              <Button small variant="ghost" data-safe onClick={close}>
                Keep private
              </Button>
            </span>
          </div>
        )}
      </div>
    </li>
  );
}

/** "brew install gh" and "gh auth login" in <code> (selectable, not clickable). */
function renderHint(text: string) {
  return text.split(/(brew install gh|gh auth login)/).map((part, i) =>
    /^(brew install gh|gh auth login)$/.test(part) ? (
      // biome-ignore lint/suspicious/noArrayIndexKey: a fixed split of one sentence
      <code key={i}>{part}</code>
    ) : (
      part
    ),
  );
}
