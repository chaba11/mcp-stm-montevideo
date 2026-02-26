#!/bin/bash
# =============================================================================
# Ralph Loop Runner for mcp-stm-montevideo
# 
# Usage: ./run-loops.sh [start_loop]
#   start_loop: optional, which loop to start from (default: auto-detect from PROGRESS.md)
#
# This script runs each loop sequentially. Each loop:
# 1. Gives Claude Code the task from loops/LOOP-XX.md
# 2. Lets it work autonomously
# 3. Verifies completion via acceptance criteria
# 4. Moves to the next loop
#
# Prerequisites:
# - Claude Code CLI installed (`claude`)
# - Git initialized in the project directory
# =============================================================================

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOOPS_DIR="$PROJECT_DIR/loops"
PROGRESS_FILE="$PROJECT_DIR/PROGRESS.md"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Auto-detect next incomplete loop from PROGRESS.md
get_next_loop() {
    local next=$(grep -n "\- \[ \]" "$PROGRESS_FILE" | head -1 | grep -oP 'LOOP-\d+' || echo "")
    echo "$next"
}

# Check if a specific loop is marked complete
is_loop_done() {
    local loop_id=$1
    grep -q "\- \[x\] $loop_id" "$PROGRESS_FILE" 2>/dev/null
}

# Run a single loop
run_loop() {
    local loop_id=$1
    local loop_file="$LOOPS_DIR/${loop_id}.md"
    
    if [ ! -f "$loop_file" ]; then
        echo -e "${RED}ERROR: Loop file not found: $loop_file${NC}"
        return 1
    fi
    
    if is_loop_done "$loop_id"; then
        echo -e "${GREEN}SKIP: $loop_id already completed${NC}"
        return 0
    fi
    
    echo ""
    echo "============================================================"
    echo -e "${YELLOW}STARTING: $loop_id${NC}"
    echo "============================================================"
    echo ""
    
    local task_content=$(cat "$loop_file")
    
    # Build the prompt for Claude Code
    local prompt="You are working on the mcp-stm-montevideo project.

Read CLAUDE.md for project context.
Read PROGRESS.md to see what's already done.

Your current task is defined in loops/${loop_id}.md:

${task_content}

IMPORTANT:
- Complete ALL steps listed in the task
- Run the acceptance criteria commands at the end
- If any acceptance criteria fails, fix the issue and re-run
- Only mark the loop as done in PROGRESS.md when ALL criteria pass
- Do a git commit with the message specified in 'On Completion'
- Do NOT proceed to the next loop. Stop after completing this one."

    # Run Claude Code with the task
    # Using --print for non-interactive mode, or just pipe the prompt
    echo "$prompt" | claude --dangerously-skip-permissions
    
    local exit_code=$?
    
    if [ $exit_code -ne 0 ]; then
        echo -e "${RED}FAILED: $loop_id (Claude Code exited with $exit_code)${NC}"
        echo "Retrying in 10 seconds..."
        sleep 10
        return 1
    fi
    
    # Verify the loop was marked as done
    if is_loop_done "$loop_id"; then
        echo -e "${GREEN}COMPLETED: $loop_id${NC}"
        return 0
    else
        echo -e "${RED}INCOMPLETE: $loop_id was not marked done in PROGRESS.md${NC}"
        echo "Claude Code may not have finished. Will retry."
        return 1
    fi
}

# Main execution
main() {
    local start_loop="${1:-}"
    local max_retries=3
    
    echo "============================================================"
    echo "  Ralph Loop Runner — mcp-stm-montevideo"
    echo "============================================================"
    echo "Project: $PROJECT_DIR"
    echo ""
    
    # If start loop specified, use it; otherwise auto-detect
    if [ -n "$start_loop" ]; then
        echo "Starting from: LOOP-$(printf '%02d' $start_loop)"
    fi
    
    # Loop sequence: feature loops interleaved with test loops
    local LOOP_ORDER=(
        "LOOP-00"
        "LOOP-01"
        "LOOP-02"
        "LOOP-02B"
        "LOOP-03"
        "LOOP-03B"
        "LOOP-04"
        "LOOP-05"
        "LOOP-05B"
        "LOOP-06"
        "LOOP-07"
        "LOOP-08"
        "LOOP-08B"
        "LOOP-09"
        "LOOP-09B"
        "LOOP-10"
    )
    
    local skip_until_found=true
    if [ -z "$start_loop" ]; then
        skip_until_found=false
    fi
    
    for loop_id in "${LOOP_ORDER[@]}"; do
        # Skip until we reach the start loop
        if [ "$skip_until_found" = true ]; then
            if [[ "$loop_id" == *"$start_loop"* ]] || [[ "$loop_id" == "LOOP-$(printf '%02d' $start_loop)" ]]; then
                skip_until_found=false
            else
                continue
            fi
        fi
        
        # Skip if already done
        if is_loop_done "$loop_id"; then
            echo -e "${GREEN}✓ $loop_id already completed${NC}"
            continue
        fi
        
        # Try the loop with retries
        local attempt=0
        local success=false
        
        while [ $attempt -lt $max_retries ] && [ "$success" = false ]; do
            attempt=$((attempt + 1))
            echo -e "${YELLOW}Attempt $attempt/$max_retries for $loop_id${NC}"
            
            if run_loop "$loop_id"; then
                success=true
            else
                if [ $attempt -lt $max_retries ]; then
                    echo "Retrying $loop_id (attempt $((attempt + 1))/$max_retries)..."
                    sleep 5
                fi
            fi
        done
        
        if [ "$success" = false ]; then
            echo -e "${RED}ABORT: $loop_id failed after $max_retries attempts${NC}"
            echo "Fix the issue manually and re-run: ./run-loops.sh $i"
            exit 1
        fi
    done
    
    echo ""
    echo "============================================================"
    echo -e "${GREEN}ALL LOOPS COMPLETED!${NC}"
    echo "============================================================"
    echo ""
    echo "Next steps:"
    echo "  1. Review the code: git log --oneline"
    echo "  2. Run full tests: npm run test && npm run test:integration"
    echo "  3. Test locally: echo '{\"jsonrpc\":\"2.0\",\"method\":\"tools/list\",\"id\":1}' | node dist/index.js"
    echo "  4. Publish: npm publish"
    echo ""
}

main "$@"
