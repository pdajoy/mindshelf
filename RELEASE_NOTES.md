## v2.3.4 — Remove Docker Publishing Workflow

### Release Workflow

- Removed the GHCR Docker image publishing pipeline from GitHub Actions
- Kept the tag-time backend TypeScript build so releases still validate the backend before publishing
- Simplified GitHub Release generation to attach only the extension zip artifact

### Repository Cleanup

- Removed Docker-specific setup instructions from both README versions
- Removed unused backend Dockerfiles now that Docker is no longer a published distribution path

### Notes

- The supported backend startup path remains `npx mindshelf serve`
- This release changes CI/release distribution only; it does not change extension or backend runtime behavior
