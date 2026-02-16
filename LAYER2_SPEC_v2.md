# Layer 2 Adapter Spec (Manual) v2.0 — Frozen

## Purpose
Map a Layer-1 command into a copy-pasteable instruction block for Lovable.
No automation yet. Human copies the generated block into Lovable.

---

## Command Types (frozen)

### 1) LOVABLE_TASK_V1
A single development task to be executed inside Lovable.

#### Payload schema
{
  "project": {
    "name": "string",
    "context": "string (short, optional)"
  },
  "task": {
    "title": "string",
    "requirements": ["string", "..."],
    "constraints": ["string", "..."],
    "deliverables": ["string", "..."]
  },
  "artifacts": {
    "paths": ["string", "..."],
    "notes": "string (optional)"
  }
}

#### Rules
- payload must be JSON object
- requirements / constraints / deliverables are arrays of strings
- keep it concise: Lovable should be able to execute without asking follow-ups

---

## Lovable Instruction Block Template (frozen)

Copy-paste this into Lovable:

TASK: {task.title}

CONTEXT:
- Project: {project.name}
- {project.context}

REQUIREMENTS:
- {requirements[0]}
- ...

CONSTRAINTS:
- {constraints[0]}
- ...

DELIVERABLES:
- {deliverables[0]}
- ...

FILES / PATHS:
- {paths[0]}
- ...

NOTES:
{artifacts.notes}

---

## Example Payload (reference)

{
  "project": { "name": "A Human - Layer 1 API", "context": "Implement minimal command channel" },
  "task": {
    "title": "Fix /commands/:id/result endpoint and ensure logs persist",
    "requirements": [
      "POST /commands/:id/result accepts {status:DONE|FAILED, result, logs[]}",
      "Writes logs to command_logs table",
      "Updates commands.status and commands.result_json"
    ],
    "constraints": [
      "No UI",
      "No n8n/Zapier",
      "No Lovable automation yet (manual copy-paste only)"
    ],
    "deliverables": [
      "Working endpoint",
      "README steps to test with curl",
      "psql query to verify logs"
    ]
  },
  "artifacts": {
    "paths": ["index.js", "migrations/*", "README.md"],
    "notes": "Keep changes minimal and consistent with Layer 1 v1.5"
  }
}

