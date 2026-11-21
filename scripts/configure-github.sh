#!/usr/bin/env bash
set -euo pipefail

owner="${1:-Lucasragg}"
name="${2:-imersao-rgt-dashboard}"
repo="$owner/$name"
api="repos/$repo"
: "${GH_TOKEN:?Disponibilize GH_TOKEN no ambiente antes de executar}"
: "${META_SHEET_ID:?Informe META_SHEET_ID}"
: "${META_GID:?Informe META_GID}"
: "${SALES_SHEET_ID:?Informe SALES_SHEET_ID}"
: "${SALES_GID:?Informe SALES_GID}"

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
login="$(gh api user --jq .login)"
if ! result="$(gh api "$api" --jq .default_branch 2>&1)"; then
  if [[ "$result" != *"HTTP 404"* || "${login,,}" != "${owner,,}" ]]; then
    printf '%s\n' "$result" >&2
    exit 1
  fi
  result="$(gh api --method POST user/repos -f name="$name" \
    -f description='Dashboard de tráfego pago da Imersão RGT' \
    -F private=false -F auto_init=true --jq .default_branch)"
fi
if [[ "$result" != main ]]; then
  printf 'A branch padrão do repositório é %s. Este projeto usa main.\n' "$result" >&2
  exit 1
fi

gh api --method PUT "$api/actions/permissions" -F enabled=true
gh api --method PUT "$api/actions/permissions/workflow" -f default_workflow_permissions=write
if ! result="$(gh api "$api/pages" --jq .build_type 2>&1)"; then
  if [[ "$result" != *"HTTP 404"* ]]; then
    printf '%s\n' "$result" >&2
    exit 1
  fi
  gh api --method POST "$api/pages" -f build_type=workflow --jq .html_url
elif [[ "$result" != workflow ]]; then
  gh api --method PUT "$api/pages" -f build_type=workflow
fi
[[ "$(gh api "$api/actions/permissions" --jq .enabled)" == true ]]
[[ "$(gh api "$api/actions/permissions/workflow" --jq .default_workflow_permissions)" == write ]]
[[ "$(gh api "$api/pages" --jq .build_type)" == workflow ]]
for variable in META_SHEET_ID META_GID SALES_SHEET_ID SALES_GID; do
  printf '%s' "${!variable}" | gh variable set "$variable" --repo "$repo"
done

checkout="$(mktemp -d)"
trap 'rm -rf "$checkout"' EXIT
credentials=(-c credential.helper= -c 'credential.helper=!gh auth git-credential')
git "${credentials[@]}" clone --branch main "https://github.com/$repo.git" "$checkout"
mkdir -p "$checkout/.github/workflows" "$checkout/src" "$checkout/scripts" "$checkout/tests"
cp "$root/.github/workflows/pages.yml" "$checkout/.github/workflows/pages.yml"
cp "$root/src/"* "$checkout/src/"
cp "$root/scripts/build.py" "$root/scripts/configure-github.sh" "$checkout/scripts/"
cp "$root/tests/"*.py "$checkout/tests/"
cp "$root/.gitignore" "$root/README.md" "$checkout/"
git -C "$checkout" add .github/workflows/pages.yml src scripts tests .gitignore README.md
if git -C "$checkout" diff --cached --quiet; then
  printf 'O código já está em main. Último build disponível:\n'
  gh run list --repo "$repo" --workflow pages.yml --limit 1
  exit 0
fi
git -C "$checkout" -c user.name="$login" -c user.email="${login}@users.noreply.github.com" \
  commit -m 'Publicar dashboard Imersão RGT'
git -C "$checkout" "${credentials[@]}" push origin HEAD:main

revision="$(git -C "$checkout" rev-parse HEAD)"
run=""
for _ in {1..20}; do
  run="$(gh run list --repo "$repo" --workflow pages.yml --event push --commit "$revision" \
    --limit 1 --json databaseId --jq '.[0].databaseId // empty' 2>/dev/null || true)"
  [[ -n "$run" ]] && break
  sleep 3
done
if [[ -z "$run" ]]; then
  printf 'A execução do commit %s ainda não apareceu no Actions.\n' "$revision" >&2
  exit 1
fi
gh run watch "$run" --repo "$repo" --exit-status --interval 5
url="$(gh api "$api/pages" --jq .html_url)"
curl --fail --silent --show-error --retry 4 --output /dev/null "${url%/}/?v=$revision"
printf 'Dashboard publicado em %s\n' "$url"
