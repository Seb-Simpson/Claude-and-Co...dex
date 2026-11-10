# NW-005D pinned integration

Starting PR19 head:4e039bb62a76ce7c871a4d72f507f3e7cabef8bf, branch feat/nw-005c-opening-integration. Actual remote https://github.com/Seb-Simpson/Claude-and-Co...dex.git.

Fetched PR17's actual draft head **83f33be348e3ae6a4aa0d91d5d11dd5d4397af48** and merged that exact commit, without conflicts, on the existing branch. It includes 1136c1a's full-quality remodelled-collapse bake and 83f33be's final evidence; the earlier interim quick bake is superseded by that final tree. Later PR17 commits, if any, are not included implicitly.

Preserved: original Blender source/models/atlas/lightmap, final lightRig/zones, ceiling collapse, door clearances and interaction anchors, classic ward and NW005B/C controller/UI/checkpoints/onboarding. No manual ambient-light increase, asset regeneration or layout replacement was made. Main's explicit PR14 revert remains effective. PR15 is not an ancestor and is not integrated.

Narrative correction is permanent: Chapter One's runtime actor selection is Nurse-only even after training permission, while the generic Patient framework/model remain usable by later game modules. The old Patient fallback chase adapter is not installed for the live opening. Inert chapter proposal exports now use Nurse confrontation IDs/effects and revision c1.2-nurse; stale c1.1 proposal checkpoints are rejected. Live opening save compatibility is unchanged. No Nurse stealth encounter is started in this task.
