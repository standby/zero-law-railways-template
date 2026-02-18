# Contributing to ZeroClaw Railway Template

Thank you for your interest in contributing!

## How to contribute

1. **Fork** the repository
2. **Create a branch** for your changes (`git checkout -b my-feature`)
3. **Make your changes** and test them locally
4. **Commit** with a clear message (`git commit -m "Add feature X"`)
5. **Push** to your fork (`git push origin my-feature`)
6. **Open a Pull Request**

## Testing locally

Before submitting a PR, please test your changes:

```bash
# Build the Docker image
docker build -t zeroclaw-railway-template .

# Run locally
docker run --rm -p 3000:3000 \
  -e SETUP_PASSWORD=test123 \
  -e PORT=3000 \
  -v $(pwd)/data:/data \
  zeroclaw-railway-template

# Visit http://localhost:3000/setup
```

## Code style

* Follow existing code style in the repository
* Keep changes minimal and focused
* Add comments for complex logic
* Update documentation if needed

## Reporting bugs

Found a bug? Please open an issue with:
* Description of the problem
* Steps to reproduce
* Expected vs actual behavior
* Environment details (Railway, local Docker, etc.)

## Questions?

Open an issue or discussion if you have questions!
