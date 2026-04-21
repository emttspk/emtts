console.log("[Worker] Worker service disabled. Queue processing is handled by the API container.");
setInterval(() => {
  console.log("[Worker] idle heartbeat");
}, 60_000);