type AppEmptyStateProps = {
  isLoading: boolean;
};

export function AppEmptyState({ isLoading }: AppEmptyStateProps) {
  return (
    <main className="app-shell loading-state">
      <section className="panel empty-panel">
        <p className="panel-kicker">Talon</p>
        <h2>{isLoading ? "Loading workspace state" : "No workspace state available"}</h2>
        <p>
          {isLoading
            ? "Refreshing hosts, session registry, diagnosis cache, and terminal state from the desktop backend."
            : "The desktop shell did not return a usable workspace snapshot. Refresh the backend state or reopen the app before connecting again."}
        </p>
      </section>
    </main>
  );
}
