import time

# Global Quiz Cache (Database)
QUIZ_CACHE = {}


def admin_upload_content(content_name, week_id):
    """
    Simulates the slow, one-time task of processing content on the Admin's side.
    Generates and caches quizzes for instant student access.
    """
    print(f"\n[ADMIN] Uploading content: '{content_name}' for {week_id}...")
    print("[ADMIN] Starting AI-powered quiz generation (this is the slow part)...")
    
    start_time = time.time()
    
    # Simulate the slow AI/LLM processing delay (5-8 seconds)
    time.sleep(7)
    
    # Generate Content-Specific Quiz
    content_quiz = {
        "quiz_id": content_name,
        "questions": [
            f"Question 1 about {content_name}",
            f"Question 2 about {content_name}",
            f"Question 3 about {content_name}"
        ],
        "generated_at": time.strftime("%Y-%m-%d %H:%M:%S")
    }
    QUIZ_CACHE[content_name] = content_quiz
    
    # Generate/Update Weekly Checkpoint Quiz
    checkpoint_quiz_id = f"{week_id} Checkpoint"
    
    # Check if checkpoint quiz already exists, if not create it
    if checkpoint_quiz_id not in QUIZ_CACHE:
        QUIZ_CACHE[checkpoint_quiz_id] = {
            "quiz_id": checkpoint_quiz_id,
            "questions": [],
            "generated_at": time.strftime("%Y-%m-%d %H:%M:%S")
        }
    
    # Add new questions to the weekly checkpoint quiz
    new_checkpoint_questions = [
        f"Checkpoint question from {content_name} - Part 1",
        f"Checkpoint question from {content_name} - Part 2"
    ]
    QUIZ_CACHE[checkpoint_quiz_id]["questions"].extend(new_checkpoint_questions)
    
    end_time = time.time()
    elapsed_time = end_time - start_time
    
    print(f"[ADMIN] ✓ Quiz generation complete!")
    print(f"[ADMIN] ✓ Cached quiz for: '{content_name}'")
    print(f"[ADMIN] ✓ Updated '{checkpoint_quiz_id}' quiz")
    print(f"[ADMIN] Total processing time: {elapsed_time:.2f} seconds")


def retrieve_quiz_instantly(quiz_id):
    """
    Universal, instant quiz retrieval function.
    CRITICAL: NO time.sleep() delay - demonstrates instant access for students.
    """
    print(f"\n[STUDENT] Requesting quiz: '{quiz_id}'...")
    
    start_time = time.time()
    
    # Instant lookup from cache
    if quiz_id in QUIZ_CACHE:
        quiz_data = QUIZ_CACHE[quiz_id]
        end_time = time.time()
        elapsed_time = end_time - start_time
        
        print(f"[STUDENT] ✓ Quiz retrieved instantly!")
        print(f"[STUDENT] Quiz ID: {quiz_data['quiz_id']}")
        print(f"[STUDENT] Questions: {len(quiz_data['questions'])}")
        for i, question in enumerate(quiz_data['questions'], 1):
            print(f"           {i}. {question}")
        print(f"[STUDENT] Retrieval time: {elapsed_time:.6f} seconds (INSTANT!)")
    else:
        print(f"[STUDENT] ✗ Quiz '{quiz_id}' not found in cache.")


def main():
    """
    Final demonstration: Contrast the slow admin cost with instant student benefit.
    """
    print("=" * 80)
    print("AUTOMATED QUIZ GENERATION & CACHING SYSTEM DEMONSTRATION")
    print("=" * 80)
    
    print("\n--- PHASE 1: SLOW ADMIN-SIDE PROCESSING (One-Time Cost) ---")
    admin_upload_content("Presentation-on-Classroom-Control.pdf", "Week 1")
    
    print("\n\n--- PHASE 2: INSTANT STUDENT-SIDE ACCESS (App-Wide Benefit) ---")
    print("(Students can now access quizzes instantly, anytime, anywhere)")
    
    # Demonstrate instant retrieval multiple times
    retrieve_quiz_instantly("Presentation-on-Classroom-Control.pdf")
    retrieve_quiz_instantly("Week 1 Checkpoint")
    
    print("\n" + "=" * 80)
    print("SUMMARY:")
    print("  • Admin processing: ~7 seconds (ONE TIME)")
    print("  • Student access: <0.001 seconds (EVERY TIME, UNLIMITED STUDENTS)")
    print("  • Result: Instant quiz delivery at scale!")
    print("=" * 80)


if __name__ == "__main__":
    main()
