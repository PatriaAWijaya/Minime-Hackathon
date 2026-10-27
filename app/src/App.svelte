<script lang="ts">
  import { onMount } from "svelte";
  import { initV5, setSendChatImpl, addGraphEdge, doSearch, filterAgents, playTimeline, primeCurate, quickChat, renderKanban, runGraphSim, selectClip, sendChat, showSetNotice, showView, switchProject, toggleAddMenu, ve2Add, ve2Note, ve2Play, ve2Select, ve2SyncName, ve2Transport, veTool, viewBack, viewForward, waAttach, waInputChanged, waMic, waToggleAttach } from "./lib/v5logic.js";
  import { sendChatReal, saveKeys, updateKeyStatus } from "./lib/chat.js";
  import { applyGateStatus } from "./lib/gates.js";
  import { createPostizDraftFromComposer } from "./lib/postiz.js";

  onMount(() => {
    initV5();
    setSendChatImpl(sendChatReal);
    applyGateStatus();
    updateKeyStatus();
  });
</script>

<div class="banner"><b>MiniMe — PROTOTYPE v5 — UI UTAMA GAYA MUSE, MONOCHROME + AKSEN PINK PASTEL #FFD1DC.</b> Tema monochrome gelap dengan aksen pink pastel #FFD1DC; susunan panel semirip lampiran (rail ikon + list agen + chat + panel Detail agen; list agen + Detail hanya tampil di window Home, window lain memakai lebar penuh). 6 ikon rail berasal dari dokumen lampiran (Home, Search, Kanban, Graph, Library, Planner); Media Studio, Video Editor &amp; Settings memakai fallback gaya garis karena tidak ada ikon lampiran untuk ketiganya. Semua interaksi dari v4 dipertahankan. Kanban TEST Kopi & Planner kini memakai data nyata (Fase 2/3 + 7 draf Postiz, per 27 Okt 2026); chat/agents/media masih simulasi di browser — media adalah placeholder dummy.</div>
<div class="app">
  <div class="sidebar">
    <img class="appmark" src="minime-icon.png" alt="MiniMe">
    <button data-view="home" class="active"><img class="railicon" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAAEA0lEQVR42u2dO4gVZxSAv7m76YS10RRGVLSSGJWkSGEQU/gqRFAERVGSTgykSCWpUisGQSWQmCAqCFqJr05MFUjhozW4lWCwSLAQfDAp9i4um13vndm5M//j++Cyy525c/ec8805/95nUZYlki89U6AAogCiAKIAogCiAKIAogCiAKIAybIIKGddJhQgD24AL+a4/p/+tqwoMnsyaNhgCztAvsWvuq8CBM7WmgUtgX2OgLh5Aqxc4DGeA0sUIO2Wn+26oGfx814XpCbA9yMuVAn84AhI56wvGritHSDC4j+dVcACmMxxJMQuwESNQuwGls1x/SpgTw0JljoCuuEScGBEbbtqUq4DuxQgjnkf0n04Aloo/vWahSmAO6mvC2ISYHONBK9ZYGveDqytIcFWR0CzPATWddyOqyZqsr+wVIAI5n2264JeYsX/ccQJL4CzKa0LQu0Ah4HfAj/TqibuKHBOAQbzGhiPpM1GPxJCGwFlxeK/6TihRUvSZCFA1cQcAj4IoYsCX9eIdUwBpjhRo/gFcDEgec/X6AZvgFO5rwFSfLg1qph6ESXqD+J4rL0AHsWyLuhCgNU1Av4M+Jx4+AT4ooYEH6c+Am4D2xJr+U2f3XeBLSkKkO3LrkKOvRdoAi6T1suwC+BKiOuCUXeATcDvFW+zGPiXNJlg6k2oVdgJ3IqxA/xUo/hFwsWnH1vVznYTuBpbB/gVOJLpvB9Vi78G7I2hA3xZsfjHMyz+tPDfVth/D7Ajhg5QetbHk7OexQ+mG3Ty30GTAuwfcr/HFn9eCZ4Oue/BEEfAMAc6CXxnrd/LaeCbtjpoUwJ8Cvw5YJ/7wEbrOxT3GPxcwgbgQSgClG0Z68Kw2Zy29VCwxQ80Z00IsMJadcZHIQgw6EmOtdapNh8O2P5zCGuAQQew/QecXz8sOnMUQAFEAUQBRAFEAUQBRAFEAUQBRAFEAUQBRAFEAUQBRAFi4iv+/wXRdS/7FCAezvSL9kuDx7zSP+aZ1JKV2msC2/q8m5Bi8jWBLRe/7ftyBAzZ9tvmgiMgnBHQ1RkZQmzZj4DDHd73MTtA9x2g63lcxNwBxkmfInLBXASKAogCiAKIAogCiAKIAogCiAKIAogCiAKIAogCiAKIAogCiAKIAogCiAKIAogCiAKIAsgs2nhrWJl4Dks7gCiA5CvA8oDjW9zAMVYGHN+C35re5pdHR5mg1OPrBZboEIufdHy9BJP0bER/S5LxjY8oSeuBQ7z7duu3/Z9jM35/O+P36W3zMde26du/Ap4D54G/WjrrNjH16aHvW2O8miP2+eIam7V9Zl5eApNMffDl340H1NAaQPw3UBRAFEAUQBRAFEAUQBRAFEAUQBRAFEAC5D+lrP3K2LgEFAAAAABJRU5ErkJggg==" alt=""><span class="tip">Home — kembali ke UI utama</span></button>
    <button data-view="search"><img class="railicon" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAAEyUlEQVR42u2dP4gWRxjGf3snB/FPVJQIVkJEE4imsDBKTq3EA8EiRQ4xJLVIDMbKJkHRIiioXSCgeJVioQiCokSiKQKKkquOGAKBaNKdUQyCMim+7+AIipnd2f1m3vd54OtmZnfn/c0z7+zuN1uFEJD8akhdIAAkASAJAEkASAJAEgCSAJAEgCQAJAeaU/j5DwO7gC3ABmBB//cX8Ai4B1wCLirUL1dV0LOA+cA1YH2Cts4C4wp//gBsBm50cJy5wD/KAfLRbSB0FHyAp/3jnZQDDFa5nMxNYJMcoPsRn4tG++dzUA7QrlYBUyX0kxygHbufKqSfAnBeDmBvrnfvBl07wNuFBx8D5z8wAD4F7hvptyAA4rQPON1S21eAncDyvj3P/FYCu1vMM0xA0EUOsAuYSNjeF8CJBvXPAJ8oJ+gGgLfoPZhpqp+ADzIexZUAaKeD2wp8GyAUCcGcjDu1yw6tEpxzKBGCtpLAvxvU/XKAHVkBkw3q79EUACPAs8JtdGt/dWF+KmgDgGCo44J1CFJPAeeNdVjd83rXqwMEo6PF6nUldYBfDFvl7hp1dnhzgNiGjgH7C8qXTLpAKgc4VaNOScGvG8wlXhwgWBsZr9D79P5rYOZaUwAwH3gcUX4aWEy5MgV7iikg9mFPycGvE9A91h0gpoGnwDzKlxkX6PqVMAvBB/jYyHU0BuArfOpcZPkRqwB8HVH2An71ndUcIKaytT9X7AWOl379AqC7ZDDL69cOIc4lAARAbY1FlL2srrYHwIaIsleN9t9zzwAsiCj70CgAv0aUXWgNgLkyUKYjyr6wBsCDiLLDRgFYEVH2iTUAYuhfZxSAZZ5zgOsRZbdrtshTuhPYTLoTKPmdArxrRADE6UNjAPwQUfaZVQBiloI3jQEQs2n151aTwHX0dvn0mAiaSICbOsCdyPJjRoJ/V8vAeiPBigvEXPNj4E3LSeA3keXfKDz4RyPLL7XuAN5cQP8MSqC9hQY/du+j7Fc+qRxgIXEPh0p0gWHiXwCpvABQxxpLg0D7A7xGozXq/Kbg2wHgVo06K4DDBoNfjFIngXWoP0BvN/Ec9WeH/eBqFfBfHQO+zXDk13nj51BJDtDWZtFNGq0yCT7WR3+bDrCo0DnXwidtsgDgEfX32p2B4McBjPr7idpxDwDAtob1N/Y7s+1NKL5vIWjFQNDFJ2NSHWAKeKewIFWeHSB1J6zuBy0AvwPvRdYfm1W/qxEa5ACFzo1enGBIneAb/iGNBN8QDOJOYAUcEQT+coDS84IKg98ZHMqgUy9kHvjPZgWssgb+oB0gZzeYBNa2fK6VAMgPhGn+347mJiDI8c+hM1//vtLxcQ/1j7u448AFOcDr9TOwpoV2zwLjmQSwkgO8WmtnOcPqBu4wQe8lj5m2xjMKXJADaI3fuRNog4i0uUtxTiAAnEMgAJxDIACcQyAAnEMgAJxDIACcQyAAnEMgAJxDIADKhOCPZCekW8EDUcgFJjlAuU4QBIAgEACCQAAIAgHgEoKPtArwvTrQKsCxEySbNgRAnhBMdpUzaArIW1vpfXLvOnCxFdoEgG9pChAAkgCQBIAkACQBIAkASQBIAkASAJIAkASAJAAkASAJAEkASAJAEgCSAJDM6F9cZScWKqW6hAAAAABJRU5ErkJggg==" alt=""><span class="tip">Search — cari tugas / kata kunci</span></button>
    <button data-view="kanban"><img class="railicon" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAAFYElEQVR42u2dz2sVVxTHv+N7jSSYkKC0UCndReKqpbtCu1f8U9pFF7qq1KxENwkt+q+0biPVLgqKBfsHFAtm09C0UeMLrwunNYTOjzv33Dv3znw+MAQe7809c8537rnnzH0vxXw+F4yXU7gAAQACAAQACAAQACAAQACAAGAcTI3PN8GlUThKQQD0kNOiiCUAAp8m8y5CcFkD3CH42QjhTutpo+XTwL8lLeHbrNiXtGIxA/xE8LNkWdKPvjPAoqSDEIuPDmxIetrj+C5roouSfu1x/OOclnTYVQDzBALfZE+KAkjFN4321KWALxIL/kJG028fthZdYlk3A8wTCr70psk0y2QGmMqwWWM0ExS+ZaAkbbO2Sh6nGFUJ4FLF619VvP6hpJel+nyOW8bOeGJg0xNjm24Z2PSy9LlLjC65pIAdSZ+1nEa+kXQjQj5zTQHzCDa5pgBrm25I2mw5zn1Jn7cVgEseCdEd9BXAM0nvG9v0u6TziQnAJSYzSe/4rgEgX6YWi8CqaSg1zmdyzt59byGATUkfSHplcK7bhmVdIekXg/M8NrbptsF5Dkqfb3obZLAGoA+QVh/AKX6sAUYOAkAAgAAAARjxWt3bm2cDXeOWh01bgWw662HTa0tDrKqAdyU9N7BnT9KaYRVg1XlzHaOuCvhD0qqBTe9J2k2lCnhudJ5VSVcDl0J9nuuqUfDNfD7UZwEh7ErxYZBrTEbTB3gU4Jw/swhsz71SbUvl3fB/RyHpQqDxP6q5A+psWqq50z8JZOuFcswmm+6FGDxUCnBpz7adQl1SQOvHoTXVzNRjLF/7XXyVZApYTHC2mwZ6byyC+JRG0MgJJYAXCV7rLNB7Y/EiJwH8UP49U+a+k8dC+Xe94vMhHqVOj02lk4pjMWAKqLqm9RM+OXmcOeHTLBaBffcBHtVUAl15LOnjofUBaAT52ZS9AE4FdExXrg14zXUtkiijpgCJh0FtZwBpoA+DdsuT+2wMPVcTfJ/AbXt8fjvADLdWXmtXXpU27aayCIwFm0L9bAo6A0CmIAAEAAgAEIAhO3Lb5PhM0pUR+v5Kee0uvtqxNsKyCrCouZdU/dBjKFVAm19eC9GbCFoFWDVcDkZw5x+k5HMLAXwbqYYdAtbX5u37IT8MSjEFsCsY0iLU3jffjY4T9dtKDcEkkK+S7AMscm/l4dNQAjgiXnn4NJQADolXHj4NJYB14pWHTykDKQNhzFgIYBk39sZyCgL4S282c/bRQ8gNy2vbK32fxCJwTdJ1gh/tGq/LaANtyE2hTf9G1rWuHfqmUEt/tY5fyK9B0wzKwF9UAVQBgABgtExxQe9MWr7viBlgOBzf6TtreRz/zNdmNSnfDYxeBlo9D9ir6QXwLCDhO9+KVb39+RhSwEjZRwCAADJf7Rctj4shjGIRGG8ROKqfigV7FkgBpBAEMGKC/FQsreB4hG4MMQMAAhgb31EGjvdZQN21UwYmzFLg4JMCMljNF5IuS/rN8bP39bYzaKMiUkD0FNCXTaQAIAUAAgAEAAgAEAAgAEAACAAQACAAQACAAP5jhmsGx8xFAA/x1+B46CKAm/hrcNx0EcD3Fa9v4cfk2XKJadWGECm9TSFsCOluT6Wf6qqALx0HiCGAXJgkFvyqWNbOAE3BLhK5wBRngCKh4Nfa09QHON0wYMzZYCOjGWAjcuDnHWPY+NWwQ0kPJH3aUXl9K78vniZixwM1/KeRphTwL3+Kn4XPjX1JK01vatsKXpF0F59mw902wXeZAVKfcqHjAnTqMQBCyDjwPgKoG3BCHKJg1mTqkgJgQLAfAAEAAgAEAAgAEAAgAEAAgABgJPwD1XDtp0kXZY4AAAAASUVORK5CYII=" alt=""><span class="tip">Kanban — semua proses tugas</span></button>
    <button data-view="graph"><img class="railicon" src="data:image/png;base64,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" alt=""><span class="tip">Graph — node koneksi antar agen</span></button>
    <button data-view="library"><img class="railicon" src="data:image/png;base64,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" alt=""><span class="tip">Library — output akhir agen</span></button>
    <button data-view="media"><img class="railicon" src="data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-width%3D%221.8%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Crect%20x%3D%222.5%22%20y%3D%225%22%20width%3D%2219%22%20height%3D%2214%22%20rx%3D%223%22/%3E%3Cpolygon%20points%3D%2210%2C9%2015.5%2C12%2010%2C15%22%20fill%3D%22white%22%20stroke%3D%22none%22/%3E%3C/svg%3E" alt=""><span class="tip">Media Studio — suara, image, reels, video</span></button>
    <button data-view="planner"><img class="railicon" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAAGX0lEQVR42u2dTWgdVRiGn5uE1P5poSXWSBHRhS5MBLvQahdFqRQtKC6qBYs/JdJCQXRRdGOhkkVwI9RIioHiQrEgFloqCmKtWBUqikpFXFSqtkYsVVMjCQ3XxcwlQ0jOnJk5Z37fBy7ce+fMmZnzvfOd78z5mVa73UY0ly4VgQQgJAAhAQgJQEgAQgIQEoCQAIQE4IoxoK1P7GewCAG0PD4K1jPmdIwDO6ssgJPARtkxu22qWAW0ZXynZflUlQQgl++nOhiqQhUg4/tlJXDZR8Y9DvLYZZnuCrAD+DD83jl2d/iZDPMaWWT/KWA5cAMwU3GDzgKrgWct7/BJXzGBCw8Ql8EJYJOD/LYBh2te55v4CLivbB7gtZjtG4DPHZ1rXwOifpMI7i1jELjbsG27Q+N33GbTm34vlL0ZGOVtxW7ORTBcJgGY1LhEdqwGWQRgiv5nVLSZ2FMFAayTnapffao7uJxclACEBCAkgCjdMlezBTArc6kKEBKAkACEBCAkACEBxHKOcoz5v7UuAvgpclEmOmkuFXRdS8Pjl6W/4gzwUtUF8Dtwc8L8VwH/FnBdUyUs631VF8C1KY+xTDWtYgAhAeRKfwnPabyMBZVkVHDcqFXTfnlzgWBY2nRJynkrcKzqAugYczNwEzBqSPci8A3wfoHXNlOQ+CpFlokhbU93/WL57gZeb5Bt2nl4VAWBCgKFBCAkANFMemp+fb3AHeH36JjCWeampcfxiQRQryg6dYtJVUBzjQ/wpgTQbB6XAIQEUBGOeMjzfgmgOjwMfOcwv1GCxa3UCqgQA3LwigGEBCAkACEBiOoLQOsDlEgAccboU9HWsxlo+4x9IvJd4/Jq4gHSdrBoKXnFAEICEBKAqLYA0gZzCgLTl9u077LsSnFSLYsT6bdMJ8xclaDMS1UFXJDtFAMICUBIAGIxeoEVEkD9GSRYJ2n+ymHTBO8DnP//b8B1eZ1cj+zjhWuAv1Lu2w+cD79PAldLANVy6y5XJVnJXF9KpZqBTeQSfpekaQMn5QHKSV49nhvDY7XkAcrBForp7m7jaNCNBJCeIeB4wn1OEMwwas37bAW+SpjXBHNT3yWAnHkQGLNMezBi6E0sPMPoGLA+ku6EZd6nszYZJYB0HLVIcyg05jMp8t8U7mszve28gsDyBXyugrQBgpXPpyzOqSUP4J9/cjR+h/8s83xPAvBLN8GDmTyNnyTvhyQAv1wp0Pi2x2hLAMWQ58inJS4zSyOALcCumDTPESwq3YTA72DO5zID/GLY/lki5SZcLDqP5eIXO8Ye4EAJBdCq8jlpZlA8dxm2jXo43q6wzL6ISXfGSd2VwANkMWSrwh7gEsHLr/K4+9sJj7FYWR0CnqxbEFjU28NXFezS09x4T/ioAiZSXtgU9cSmI6gzFGzIkGaoyGoyiQDWknzptQlgeU0F8Kph2+bQqJ1X5o2x8PsTv8a+U2khxvMUAATPpm1mqXTSrK1x29+0buAHC/y3DHhlnmu/PWMV9FYRzwGaxFLH+T0PvJHA5a8B/jZs/z7rCak30IyPdYmedthyWikP4JfLKffblrV5bpluUAIoji2GbYdJN1BjPOGzhUckgOLYH7P9+oT5rQd2Jtxnu2KA4rAZkGn7ut3C1lGQB4jn54z7r/Fk/NWGbSMSgDtML4r42GL/i8C+Bf4/mvHO/9Owba91tKl3B+d6rWcJJnwOlOWc5AHsMPWDJBmAcWMOxn9HMYB7TI+0N5Qs+Hw0LwFMSBdWd6RrThu2/ZhnK+Blw7Y6rhbeKoEI4o5xS54CONBA7/BlgSKIy3skTaY+Y4ChGgrgTktDuexFvMdSWHuLEIBpSPQY5gGVSemtSFUAwSioc47u+k8dnZMXAcTNfD2VsJlk4o8SeYJ+izTrQgOeTZj3CuZWDMOn8SHbg6Coq7cZ1nQF2MHic98nCUb+DsdcbDTANPXXJxlE2h3Zpxf41bI5djpFeY0C7wI/hL9vAx4jwUDOCD1kHCzrQgB5N4PK5O77Cgx4nXQguRJAk0VQxLWXcpGoui4N32d57UdyOJdh1+Xs0gN0+Das15rkAXx7gwk8jbD28RxggGa/KKIzJP6Ug7yO43l4fVcOBTHeoLs/yt2RMkgyiXR/ZL8HvF+ghypAVAh1B0sAQgIQEoCQAIQEICQAIQEICUA0hP8BHdKP+XuUm/gAAAAASUVORK5CYII=" alt=""><span class="tip">Planner — auto post Meta &amp; Postiz</span></button>
    <button data-view="videoeditor"><img class="railicon" src="data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-width%3D%221.8%22%20stroke-linecap%3D%22round%22%3E%3Crect%20x%3D%222.5%22%20y%3D%225%22%20width%3D%2219%22%20height%3D%2214%22%20rx%3D%223%22/%3E%3Cline%20x1%3D%227%22%20y1%3D%225%22%20x2%3D%227%22%20y2%3D%2219%22/%3E%3Cline%20x1%3D%2217%22%20y1%3D%225%22%20x2%3D%2217%22%20y2%3D%2219%22/%3E%3Crect%20x%3D%224%22%20y%3D%228%22%20width%3D%222%22%20height%3D%222%22%20fill%3D%22white%22%20stroke%3D%22none%22/%3E%3Crect%20x%3D%224%22%20y%3D%2214%22%20width%3D%222%22%20height%3D%222%22%20fill%3D%22white%22%20stroke%3D%22none%22/%3E%3Crect%20x%3D%2218%22%20y%3D%228%22%20width%3D%222%22%20height%3D%222%22%20fill%3D%22white%22%20stroke%3D%22none%22/%3E%3Crect%20x%3D%2218%22%20y%3D%2214%22%20width%3D%222%22%20height%3D%222%22%20fill%3D%22white%22%20stroke%3D%22none%22/%3E%3C/svg%3E" alt=""><span class="tip">Video Editor — timeline &amp; preview (UI)</span></button>
    <div class="spacer"></div>
    <button data-view="settings"><img class="railicon" src="data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-width%3D%221.8%22%20stroke-linecap%3D%22round%22%3E%3Ccircle%20cx%3D%2212%22%20cy%3D%2212%22%20r%3D%223.2%22/%3E%3Cpath%20d%3D%22M12%202.5v2.8M12%2018.7v2.8M2.5%2012h2.8M18.7%2012h2.8M5%205l2%202M17%2017l2%202M19%205l-2%202M7%2017l-2%202%22/%3E%3C/svg%3E" alt=""><span class="tip">Settings — semua pengaturan aplikasi</span></button>
  </div>

  <div class="col" id="agentCol">
    <div class="brand"><img src="minime-logo.png" alt="MiniMe"></div>
    <div class="agent-topbar">
      <span class="scope-dot"></span><span class="agent-scope">Local</span><span style="color:#a1a1a1">⌄</span>
      <span style="flex:1"></span>
      <button class="nav-arrow" onclick={() => { viewBack() }} title="Kembali">‹</button>
      <button class="nav-arrow" onclick={() => { viewForward() }} title="Maju">›</button>
      <button class="agent-plus" onclick={() => { toggleAddMenu() }} title="Tambah agen">＋</button>
    </div>
    <div class="add-menu" id="addMenu"></div>
    <div class="agent-searchbox"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a1a1a1" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="21" y2="21"/></svg><input type="text" id="navSearch" placeholder="Search" oninput={(e) => { filterAgents(e.currentTarget.value) }}></div>
    <div style="padding:0 14px;flex-shrink:0"><div class="mainchat" onclick={() => { showView('home') }}><div class="av" style="background:#FFD1DC">P</div><div><b>Main chat</b><br><small style="color:#a1a1a1">Prime Agent — chat utama</small></div></div></div>
    <div class="scroll" id="agentList"></div>
    <div style="padding:0 14px 12px;flex-shrink:0"><div class="notice" id="addNotice" style="display:none"></div></div>
  </div>
  <div class="resizer" id="resizeAgent"></div>

  <div class="col" id="chatCol">
    <div class="view active" id="view-home">
      <div class="colhead chat-date-head">
        <div class="chat-date">Today 2:31 PM</div>
        <div class="chat-proj" id="chatProj">TEST Kopi Surabaya</div>
        <label style="margin-top:8px">Proyek aktif
          <select id="projectSel" onchange={(e) => { switchProject(e.currentTarget.value) }} style="margin-top:4px">
            <option value="kopi">TEST Kopi Surabaya</option>
            <option value="produk">TEST Produk Digital</option>
          </select>
        </label>
      </div>
      <div class="scroll" id="chatBox"></div>
      <div class="composer">
        <div>
          <span class="chip" onclick={() => { quickChat('Riset kompetitor kopi susu kekinian di Surabaya, lalu buatkan carousel-nya.') }}>Riset kompetitor + carousel</span>
          <span class="chip" onclick={() => { quickChat('Buatkan talking head untuk promo bundling.') }}>Talking head promo</span>
          <button class="btn btn-sm" onclick={() => { primeCurate() }}>Kurasi Prime (simulasi)</button>
        </div>
        <div class="wa-pop" id="attachMenu">
          <button onclick={() => { waAttach('Gambar') }}>🖼 Gambar</button>
          <button onclick={() => { waAttach('Dokumen') }}>📄 Dokumen</button>
          <button onclick={() => { waAttach('Kamera') }}>📷 Kamera</button>
          <button onclick={() => { waAttach('Audio') }}>🎵 Audio</button>
        </div>
        <div class="wa-pill main-pill">
          <button class="pill-plus" onclick={() => { waToggleAttach() }} title="Lampirkan">＋</button>
          <input type="text" id="chatInput" placeholder="Message Prime Agent" oninput={() => { waInputChanged() }} autocomplete="off">
          <button class="pill-mic" onclick={() => { waMic() }} title="Pesan suara (simulasi)"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#a1a1a1" stroke-width="1.8" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><line x1="12" y1="18" x2="12" y2="21"/></svg></button>
          <button class="pill-send" onclick={() => { sendChat() }} title="Kirim"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#262626" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg></button>
        </div>
        <div class="notice" id="waNote" style="display:none;margin-top:0"></div>
      </div>
    </div>
    <div class="view" id="view-search">
      <div class="colhead"><h2>Search</h2><p>Cari di chat proyek aktif.</p></div>
      <div class="scroll">
        <input type="text" id="searchInput" placeholder="Ketik kata kunci… mis. QRIS, STP, carousel" oninput={() => { doSearch() }}>
        <p id="searchCount" style="color:#555"></p>
        <div id="searchResults"></div>
      </div>
    </div>
    <div class="view" id="view-kanban">
      <div class="colhead">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <div class="av" style="background:#FFD1DC">P</div>
          <h2 id="kanbanTitle" style="margin:0">TEST Kopi Surabaya</h2><span style="color:#FFD1DC;font-size:18px">☆</span>
          <div style="margin-left:auto;display:flex;align-items:center">
            <div class="av" style="width:28px;height:28px;font-size:12px;background:#FFD1DC">P</div>
            <div class="av" style="width:28px;height:28px;font-size:12px;background:#FFD1DC;margin-left:-8px">R</div>
            <div class="av" style="width:28px;height:28px;font-size:12px;background:#404040;margin-left:-8px">S</div>
            <div class="av" style="width:28px;height:28px;font-size:12px;background:#5b5b5b;margin-left:-8px">K</div>
            <div class="av" style="width:28px;height:28px;font-size:12px;background:#5b5b5b;margin-left:-8px">M</div>
            <button class="btn btn-sm" style="margin-left:10px" onclick={() => { alert('Simulasi: tambah anggota tim (tampilan saja).') }}>＋</button>
          </div>
        </div>
        <div class="kb-tabs">
          <button data-kbtab="kanban" class="active">Kanban</button>
          <button data-kbtab="table">Table</button>
          <button data-kbtab="list">List</button>
          <span style="flex:1"></span>
          <label style="margin:0;font-weight:400;font-size:13px">Filter agen
            <select id="kbFilter" onchange={() => { renderKanban() }} style="width:auto;margin-left:6px">
              <option value="">Semua agen</option><option>Prime Agent</option><option>Riset</option><option>Strategi</option><option>Kreatif</option><option>Media</option><option>Distribusi</option><option>Produk Digital</option>
            </select>
          </label>
        </div>
        <p style="margin-top:8px">Seret kartu antar kolom, atau pakai tombol Maju. Tab Table/List menampilkan tugas yang sama dalam bentuk berbeda (simulasi).</p>
      </div>
      <div class="scroll"><div id="kanbanBox"></div></div>
    </div>
    <div class="view" id="view-graph">
      <div class="colhead"><h2>Graph — Alur Agen (gaya n8n)</h2><p>Kanvas titik gelap. Seret node untuk mengatur alur — kurva ikut bergerak. Klik node untuk detail, tombol ＋ di node output untuk menambah node, atau jalankan simulasi alurnya.</p>
      <button class="btn btn-primary" onclick={() => { runGraphSim() }}>▶ Jalankan Simulasi Alur</button></div>
      <div class="scroll">
        <div class="n8n-canvas" id="graphBox"><svg id="graphEdges"></svg><div id="graphNodes"></div></div>
        <div style="background:#1f1f1f;border:1px solid #2a2a2a;border-radius:8px;padding:12px;margin-top:12px">
          <h3 style="margin:0 0 6px" id="gnodeInfo">Klik sebuah node untuk melihat detailnya.</h3>
          <p id="gnodeDetail" style="color:#a1a1a1;margin:0">Detail node dan aliran koneksinya akan tampil di sini.</p>
        </div>
        <label>Tambah koneksi</label>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <select id="gFrom" style="flex:1"></select>
          <select id="gTo" style="flex:1"></select>
          <input type="text" id="gLabel" placeholder="Label aliran, mis. true / false / referensi visual" style="flex:1">
          <button class="btn btn-primary" onclick={() => { addGraphEdge() }}>+ Tambah</button>
        </div>
        <ul id="graphList"></ul>
        <div class="notice" id="graphNotice" style="display:none"></div>
      </div>
    </div>
    <div class="view" id="view-library">
      <div class="colhead"><h2>Library — Output Akhir Agen</h2><p>"Gunakan" mengirim pesan Prime ke chat. "Perbaiki Lanjut" membuat kartu Revisi di Kanban + pesan di chat.</p></div>
      <div class="scroll">
        <table><tbody id="libBody"></tbody></table>
        <div class="notice" id="libNotice" style="display:none"></div>
      </div>
    </div>
    <div class="view" id="view-media">
      <div class="colhead"><h2>Media Studio</h2><p>Suara (Voice Studio), Image &amp; Reels, Video Editor gaya Diffusion (preview + inspector + timeline multi-track, simulasi klik). Fallback Canva siaga bila Meta &amp; Gemini gagal.</p></div>
      <div class="scroll">
        <div class="notice" style="margin-top:0">Status generator (simulasi): Meta Image — <b>belum aktif</b> • Gemini Image — <b>siaga</b> • <b>Canva Fallback: SIAGA</b> (hasil Canva berlabel "via Canva (fallback)", image-only).</div>
        <div class="filters">
          <button class="active" data-filter="semua">Semua</button>
          <button data-filter="gambar">Gambar</button>
          <button data-filter="carousel">Carousel</button>
          <button data-filter="reels">Reels</button>
          <button data-filter="talking">Talking Head</button>
        </div>
        <div class="mediagrid" id="mediaGrid"></div>
        <div class="notice" id="mediaNotice" style="display:none"></div>
        <h3>Video Editor — gaya Diffusion Studio (layout dipelajari, kode sendiri)</h3>
        <div class="notice" style="margin-top:0">Pola Diffusion: alat eksternal via MCP/CLI (PROVISIONAL, bukan bundle UI) — agen memanggil <b>probe → transcribe → check → capture → render</b>. Uji 1 klip 15–30 detik vertikal masih tertunda; semua di bawah ini simulasi klik, bukan render sungguhan.</div>
        <div class="ve-toolbar">
          <button class="btn btn-sm" onclick={() => { veTool('Potong') }}>✂ Potong</button>
          <button class="btn btn-sm" onclick={() => { veTool('Tambah Teks') }}>T Tambah Teks</button>
          <button class="btn btn-sm" onclick={() => { veTool('Subtitle') }}>Subtitle</button>
          <button class="btn btn-sm" onclick={() => { veTool('Transisi') }}>Transisi</button>
          <button class="btn btn-sm" onclick={() => { veTool('Suara') }}>Suara</button>
          <span id="veToolNote" style="color:#a1a1a1;font-size:13px;margin-left:8px"></span>
        </div>
        <div class="ve-wrap">
          <div class="ve-preview">
            <div class="ve-canvas"><div style="font-size:42px">▶</div><div id="vePreviewLabel">Preview: Hook (0–8 dtk)</div><small>Canvas dummy 16:9 — bukan video sungguhan</small></div>
            <div class="ve-timecode"><span>00:00:00</span><span>/ 00:00:30</span><span style="margin-left:auto">16:9 • dummy</span></div>
          </div>
          <div class="ve-inspector">
            <h4 style="margin:0 0 8px">Inspector — klip terpilih</h4>
            <label>Nama</label><div id="veClipName" class="ve-field">Hook (0–8 dtk)</div>
            <label>Mulai</label><div id="veClipStart" class="ve-field">0 dtk</div>
            <label>Durasi</label><div id="veClipDur" class="ve-field">8 dtk</div>
            <label>Track</label><div id="veClipTrack" class="ve-field">Video</div>
            <p style="color:#a1a1a1;font-size:13px">Klik batang klip di timeline untuk memilih. Di Diffusion, properti seperti ini menjadi kontrol live dari kode komposisi (@inspect).</p>
          </div>
        </div>
        <div class="timeline" id="timeline">
          <div class="playhead" id="playhead" style="left:0%"></div>
          <div class="ve-ruler"><span>00:00</span><span>00:10</span><span>00:20</span><span>00:30</span></div>
          <div style="color:#d1d5db;font-size:13px;margin-bottom:8px">Durasi 00:30 (simulasi) — tekan Putar untuk menggerakkan playhead</div>
          <div class="track"><span class="tlabel">Video</span><div class="bar ve-clip" style="background:#FFD1DC;width:27%" onclick={(e) => { selectClip(e.currentTarget,'Hook (0–8 dtk)','0 dtk','8 dtk','Video') }}>Hook (0–8 dtk)</div><div class="bar ve-clip" style="background:#5b5b5b;width:47%" onclick={(e) => { selectClip(e.currentTarget,'Isi (8–22 dtk)','8 dtk','14 dtk','Video') }}>Isi (8–22 dtk)</div><div class="bar ve-clip" style="background:#404040;width:26%" onclick={(e) => { selectClip(e.currentTarget,'CTA (22–30 dtk)','22 dtk','8 dtk','Video') }}>CTA</div></div>
          <div class="track"><span class="tlabel">Audio</span><div class="bar ve-clip" style="background:#5b5b5b;width:80%" onclick={(e) => { selectClip(e.currentTarget,'Voice-over promo bundling','0 dtk','30 dtk','Audio') }}>Voice-over promo bundling</div></div>
          <div class="track"><span class="tlabel">Teks</span><div class="bar ve-clip" style="background:#5b5b5b;width:30%" onclick={(e) => { selectClip(e.currentTarget,'Overlay: TEST Kopi — Rp15.000','0 dtk','9 dtk','Teks') }}>Overlay: TEST Kopi — Rp15.000</div><div class="bar ve-clip" style="background:#4a4a4a;width:30%" onclick={(e) => { selectClip(e.currentTarget,'Overlay: Pesan via WA','12 dtk','9 dtk','Teks') }}>Overlay: Pesan via WA</div></div>
        </div>
        <button class="btn btn-primary" onclick={() => { playTimeline() }}>▶ Putar Playhead (simulasi)</button>
        <button class="btn btn-sm" onclick={() => { showView('videoeditor') }}>Buka Video Editor lengkap →</button>
      </div>
    </div>
    <div class="view" id="view-videoeditor">
      <div class="colhead"><h2>Video Editor</h2><p>Proyek: TEST Kopi Surabaya — Promo Bundling 00:30. Layout gaya Diffusion (aset + preview + inspector + timeline), kode sendiri, simulasi klik — belum tersambung engine render.</p></div>
      <div class="scroll">
        <div class="ve2-toolbar">
          <button class="btn btn-sm" onclick={() => { ve2Note('Simulasi: proyek tersimpan (tampilan saja).') }}>Simpan Proyek</button>
          <button class="btn btn-sm" onclick={() => { ve2Note('Belum bisa diekspor: engine render belum ada (lihat daftar engine di bawah).') }}>Ekspor MP4</button>
          <button class="btn btn-sm" onclick={() => { ve2Note('Simulasi: render preview belum tersedia — butuh preview engine.') }}>Render Preview</button>
        </div>
        <div class="ve2-top">
          <div class="ve2-assets">
            <h4 style="margin:0 0 8px">Aset</h4>
            <div class="ve2-asset" onclick={() => { ve2Add('Footage: Kedai kopi pagi') }}><span>🎬 Footage: Kedai kopi pagi</span><span>+</span></div>
            <div class="ve2-asset" onclick={() => { ve2Add('B-Roll: Seduh & sajikan') }}><span>🎬 B-Roll: Seduh &amp; sajikan</span><span>+</span></div>
            <div class="ve2-asset" onclick={() => { ve2Add('Voice-over: Promo bundling') }}><span>🎙 Voice-over: Promo bundling</span><span>+</span></div>
            <div class="ve2-asset" onclick={() => { ve2Add('Musik: Akustik ringan') }}><span>🎵 Musik: Akustik ringan</span><span>+</span></div>
            <div class="ve2-asset" onclick={() => { ve2Add('Teks: Overlay harga') }}><span>🔤 Teks: Overlay harga</span><span>+</span></div>
            <p style="color:#a1a1a1;font-size:13px">Klik aset untuk simulasi tambah ke timeline.</p>
          </div>
          <div class="ve2-preview">
            <div class="ve2-canvas"><div style="font-size:42px">▶</div><div id="ve2PreviewLabel">Preview: Hook (0–8 dtk)</div><small>Canvas dummy 16:9 — bukan video sungguhan</small></div>
            <div class="ve2-transport"><button onclick={() => { ve2Transport('start') }} title="Ke awal">⏮</button><button onclick={() => { ve2Play() }} title="Putar">▶ Putar</button><button onclick={() => { ve2Transport('end') }} title="Ke akhir">⏭</button><span id="ve2Time">00:00:00 / 00:00:30</span><span style="margin-left:auto">Zoom: <select id="ve2Zoom" onchange={() => { ve2Note('Simulasi: zoom timeline belum mengubah skala (tampilan saja).') }}><option>100%</option><option>50%</option><option>200%</option></select></span></div>
          </div>
          <div class="ve2-inspector">
            <h4 style="margin:0 0 8px">Inspector — klip terpilih</h4>
            <label>Nama</label><input id="ve2Name" value="Hook (0–8 dtk)" oninput={() => { ve2SyncName() }}>
            <label>Mulai (dtk)</label><input id="ve2Start" value="0" type="number">
            <label>Durasi (dtk)</label><input id="ve2Dur" value="8" type="number">
            <label>Track</label><div id="ve2Track" class="ve-field">Video</div>
            <label>Efek</label><select id="ve2Fx" onchange={() => { ve2Note('Simulasi: efek belum diterapkan — butuh engine render.') }}><option>Tanpa efek</option><option>Fade in/out</option><option>Zoom halus</option></select>
            <span id="ve2Note" class="ve2-note"></span>
          </div>
        </div>
        <div class="timeline">
          <div class="playhead" id="playhead2" style="left:0%"></div>
          <div class="ve-ruler"><span>00:00</span><span>00:10</span><span>00:20</span><span>00:30</span></div>
          <div class="track"><span class="tlabel">Video</span><div class="bar ve-clip" style="background:#FFD1DC;width:27%" onclick={(e) => { ve2Select(e.currentTarget,'Hook (0–8 dtk)',0,8,'Video') }}>Hook (0–8 dtk)</div><div class="bar ve-clip" style="background:#5b5b5b;width:47%" onclick={(e) => { ve2Select(e.currentTarget,'Isi (8–22 dtk)',8,14,'Video') }}>Isi (8–22 dtk)</div><div class="bar ve-clip" style="background:#404040;width:26%" onclick={(e) => { ve2Select(e.currentTarget,'CTA (22–30 dtk)',22,8,'Video') }}>CTA</div></div>
          <div class="track"><span class="tlabel">B-Roll</span><div class="bar ve-clip" style="background:#5b5b5b;margin-left:27%;width:47%" onclick={(e) => { ve2Select(e.currentTarget,'B-Roll: seduh kopi',8,14,'B-Roll') }}>B-Roll: seduh kopi</div></div>
          <div class="track"><span class="tlabel">Audio</span><div class="bar ve-clip" style="background:#5b5b5b;width:80%" onclick={(e) => { ve2Select(e.currentTarget,'Voice-over promo bundling',0,30,'Audio') }}>Voice-over promo bundling</div><div class="bar ve-clip" style="background:#4a4a4a;width:20%" onclick={(e) => { ve2Select(e.currentTarget,'Musik: akustik ringan',0,30,'Audio') }}>Musik</div></div>
          <div class="track"><span class="tlabel">Teks</span><div class="bar ve-clip" style="background:#5b5b5b;width:30%" onclick={(e) => { ve2Select(e.currentTarget,'Overlay: TEST Kopi — Rp15.000',0,9,'Teks') }}>Overlay: TEST Kopi — Rp15.000</div><div class="bar ve-clip" style="background:#4a4a4a;margin-left:10%;width:30%" onclick={(e) => { ve2Select(e.currentTarget,'Overlay: Pesan via WA',12,9,'Teks') }}>Overlay: Pesan via WA</div></div>
        </div>
        <div class="notice">Render sungguhan butuh engine yang belum ada: model komposisi timeline, compiler ke FFmpeg, preview engine, probe/transcribe, audio mixing, dan asset library — daftar lengkap di <b>docs/video-editor-engines.md</b>.</div>
      </div>
    </div>
    <div class="view" id="view-planner">
      <div class="colhead"><h2>Planner — Auto Post (Meta &amp; Postiz)</h2><p>Mode default: <span class="badge b-ok">DRAF saja</span>. "Siapkan untuk Post" dari Media Studio menambahkan baris draf di sini.</p></div>
      <div class="scroll">
        <table><thead><tr><th>Item</th><th>Channel</th><th>Tanggal draf</th><th>Status</th><th>Draf Postiz</th></tr></thead><tbody id="plannerBody"></tbody></table>
        <div class="notice">Data di bawah adalah 7 draf Postiz nyata (dibuat 27 Okt 2026 15:35 WIB, mode DRAF saja, belum terjadwal kirim — menunggu GBatch). Tanggal draf sesuai record (UTC). Tidak ada tombol terbit live di slice ini.</div>
        <h3>Buat draf Postiz baru (B5 — DRAF saja, tidak pernah terbit/jadwal)</h3>
        <p>Draf teks saja (caption). Channel mengikuti default Postiz — cek/pindah di dashboard Postiz. Butuh kunci Postiz di Settings.</p>
        <p><textarea id="postizText" placeholder="Tulis caption draf..." rows="3" style="width:100%"></textarea></p>
        <button class="btn btn-primary" onclick={() => { createPostizDraftFromComposer() }}>Buat Draf di Postiz</button>
        <div class="notice" id="postizNotice" style="display:none"></div>
      </div>
    </div>
    <div class="view" id="view-settings">
      <div class="colhead"><h2>Settings — Pengaturan Aplikasi</h2><p>Global, bukan per proyek. Perubahan di prototype hanya simulasi.</p></div>
      <div class="scroll">
        <h3>Koneksi &amp; Provider</h3>
        <p><label><input type="checkbox" checked> Meta Model API (Muse) — utama</label><label><input type="checkbox" checked> Gemini — fallback 1</label><label><input type="checkbox" checked> Ollama lokal — fallback 2/3</label><label><input type="checkbox" checked> Canva Fallback untuk Image (bila Meta &amp; Gemini gagal)</label><label><input type="checkbox"> Voice Studio (127.0.0.1:3900)</label></p>
        <h3>Kunci API (B3 — disimpan lokal di perangkat ini saja)</h3>
        <p><label>Gemini API key: <input type="password" id="apiKeyGemini" placeholder="Belum diisi" style="width:320px"></label><label>Meta API key: <input type="password" id="apiKeyMeta" placeholder="Belum diisi (butuh klaim $150 + kartu)" style="width:320px"></label><label>Postiz API key: <input type="password" id="apiKeyPostiz" placeholder="Belum diisi (dari Keychain MacBook)" style="width:320px"></label><label>Ollama lokal: tidak butuh kunci (127.0.0.1:11434)</label></p>
        <button class="btn btn-primary" onclick={() => { saveKeys() }}>Simpan Kunci</button>
        <div class="notice" id="keyStatus"></div>
        <h3>Gerbang &amp; Distribusi</h3>
        <p><label><input type="checkbox" checked> Distribusi default DRAF saja</label><label><input type="checkbox"> Auto post batch terjadwal (butuh persetujuan awal tiap batch)</label></p>
        <h3>Biaya &amp; Tampilan</h3>
        <p><label><input type="checkbox" checked> Tampilkan biaya dalam Rupiah dulu</label><label>Kurs USD→IDR (referensi): <input type="text" value="18137" style="width:120px"></label></p>
        <button class="btn btn-primary" onclick={() => { showSetNotice() }}>Simpan Pengaturan (simulasi)</button>
        <div class="notice" id="setNotice" style="display:none"></div>
      </div>
    </div>
  </div>
  <div class="resizer" id="resizeDetail"></div>

  <div class="col" id="detailCol">
    <div class="scroll" id="detailBody"></div>
  </div>
</div>
