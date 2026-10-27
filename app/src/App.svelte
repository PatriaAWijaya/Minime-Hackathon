<script lang="ts">
  let count = $state(0);
</script>

<main>
  <h1>MiniMe</h1>
  <p>Svelte mounted — Tahap B1 shell (migrasi komponen penuh menyusul di B2).</p>
  <button onclick={() => count++}>Klik: {count}</button>
</main>

<style>
  main {
    font-family: system-ui, sans-serif;
    background: #171717;
    color: #ececec;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    margin: 0;
  }
  h1 {
    margin: 0;
  }
  p {
    color: #a1a1a1;
    margin: 0;
  }
  button {
    background: #ffd1dc;
    color: #262626;
    border: none;
    border-radius: 8px;
    padding: 10px 18px;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
  }
</style>
