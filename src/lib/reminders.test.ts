import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  followUpMessage,
  inviteToCloseMessage,
  inviteToVisitMessage,
  officeDigestMessage,
  paperworkMessage,
  visitConfirmMessage,
} from "./reminders.ts";

describe("whatsapp reminder copy", () => {
  it("confirms a visit without dumping iso dates", () => {
    const text = visitConfirmMessage({
      producerName: "Ramón Payán",
      when: new Date("2026-08-21T16:00:00-07:00"),
      purpose: "Primera visita",
      place: "Campo",
    });
    assert.match(text, /Ramón Payán/);
    assert.match(text, /Santa Rosa/);
    assert.doesNotMatch(text, /T16:00/);
  });

  it("lists missing documents", () => {
    const text = paperworkMessage({
      producerName: "Los Cañeros",
      agentName: "Luis Cota",
      missing: ["INE vigente", "Predial"],
    });
    assert.match(text, /• INE vigente/);
    assert.match(text, /Luis Cota/);
  });

  it("asks for a follow-up", () => {
    const text = followUpMessage({
      producerName: "Felipe Montoya",
      agentName: "Jesús Zazueta",
      stageLabel: "Prospecto",
    });
    assert.match(text, /prospecto/);
  });
});

describe("office invite copy", () => {
  it("asks the director to join a visit", () => {
    const text = inviteToVisitMessage({
      personName: "Don Javier",
      agentName: "Luis Cota",
      producerName: "Ramón Payán",
      when: new Date("2026-08-21T16:00:00-07:00"),
      purpose: "Cerrar trato",
      place: "Campo 40",
      crop: "Maíz blanco",
      hectares: 80,
      zone: "Guasave",
    });
    assert.match(text, /Don Javier/);
    assert.match(text, /Luis Cota/);
    assert.match(text, /Ramón Payán/);
    assert.match(text, /80 ha/);
    assert.doesNotMatch(text, /T16:00/);
  });

  it("asks for help closing without a visit time", () => {
    const text = inviteToCloseMessage({
      personName: "Don Javier",
      agentName: "María Beltrán",
      producerName: "Los Cañeros",
      crop: "Sorgo",
      hectares: 40,
      zone: "Ahome",
      stageLabel: "Convencido",
    });
    assert.match(text, /cerrar con Los Cañeros/);
    assert.match(text, /Sorgo/);
  });

  it("builds a short digest for office", () => {
    const text = officeDigestMessage({
      personName: "Don Javier",
      lines: ["Cita hoy: Ramón Payán a las 4:00 p.m.", "Papeles: Los Cañeros, faltan 3"],
    });
    assert.match(text, /Don Javier/);
    assert.match(text, /• Cita hoy/);
    assert.match(text, /Santa Rosa/);
  });
});
