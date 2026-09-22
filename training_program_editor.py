#!/usr/bin/env python3
"""
Admin Training Program Editor
A command-line tool to manage training program curriculum weeks.
"""

# Initial training program data
training_program = [
    {"week_number": 1, "name": "Classroom Management Techniques"},
    {"week_number": 2, "name": "Student Engagement Strategies"},
    {"week_number": 3, "name": "Assessment and Evaluation Methods"},
    {"week_number": 4, "name": "Differentiated Instruction Approaches"},
    {"week_number": 5, "name": "Technology Integration in Teaching"}
]


def display_all_weeks():
    """Display all training weeks in a formatted list."""
    print("\n" + "=" * 60)
    print("CURRENT TRAINING PROGRAM")
    print("=" * 60)
    
    if not training_program:
        print("No weeks in the training program.")
    else:
        for week in training_program:
            print(f"Week {week['week_number']}: {week['name']}")
    
    print("=" * 60 + "\n")


def rename_week():
    """Allow the user to rename a specific week."""
    display_all_weeks()
    
    if not training_program:
        print("Cannot rename. No weeks available.\n")
        return
    
    try:
        week_num = int(input(f"Enter the week number to rename (1-{len(training_program)}): "))
        
        if week_num < 1 or week_num > len(training_program):
            print(f"Error: Please enter a valid week number between 1 and {len(training_program)}.\n")
            return
        
        new_name = input("Enter the new name for this week: ").strip()
        
        if not new_name:
            print("Error: Week name cannot be empty.\n")
            return
        
        # Find and update the week
        for week in training_program:
            if week['week_number'] == week_num:
                old_name = week['name']
                week['name'] = new_name
                print(f"\n✓ Successfully renamed Week {week_num}")
                print(f"  From: {old_name}")
                print(f"  To:   {new_name}\n")
                break
    
    except ValueError:
        print("Error: Please enter a valid number.\n")


def reorder_weeks():
    """Move a week to a new position and renumber all weeks sequentially."""
    display_all_weeks()
    
    if len(training_program) < 2:
        print("Cannot reorder. Need at least 2 weeks in the program.\n")
        return
    
    try:
        week_to_move = int(input(f"Enter the week number to move (1-{len(training_program)}): "))
        
        if week_to_move < 1 or week_to_move > len(training_program):
            print(f"Error: Please enter a valid week number between 1 and {len(training_program)}.\n")
            return
        
        new_position = int(input(f"Enter the new position for this week (1-{len(training_program)}): "))
        
        if new_position < 1 or new_position > len(training_program):
            print(f"Error: Please enter a valid position between 1 and {len(training_program)}.\n")
            return
        
        if week_to_move == new_position:
            print("Week is already at that position. No changes made.\n")
            return
        
        # Find the week to move (by current index, which is week_number - 1)
        week_data = training_program[week_to_move - 1]
        week_name = week_data['name']
        
        # Remove the week from its current position
        training_program.pop(week_to_move - 1)
        
        # Insert it at the new position (new_position - 1 for 0-based indexing)
        training_program.insert(new_position - 1, week_data)
        
        # Renumber all weeks to maintain sequential order
        for index, week in enumerate(training_program):
            week['week_number'] = index + 1
        
        print(f"\n✓ Successfully moved '{week_name}'")
        print(f"  From: Position {week_to_move}")
        print(f"  To:   Position {new_position}")
        print("\nAll weeks have been renumbered sequentially.\n")
    
    except ValueError:
        print("Error: Please enter a valid number.\n")


def display_menu():
    """Display the main menu options."""
    print("\n" + "=" * 60)
    print("TRAINING PROGRAM EDITOR - ADMIN PANEL")
    print("=" * 60)
    print("1. Display All Weeks")
    print("2. Rename a Week")
    print("3. Reorder/Shuffle Weeks")
    print("4. Exit")
    print("=" * 60)


def main():
    """Main program loop."""
    print("\n🎓 Welcome to the Training Program Editor!")
    print("Manage your curriculum weeks with ease.\n")
    
    while True:
        display_menu()
        
        choice = input("\nEnter your choice (1-4): ").strip()
        
        if choice == '1':
            display_all_weeks()
        elif choice == '2':
            rename_week()
        elif choice == '3':
            reorder_weeks()
        elif choice == '4':
            print("\n👋 Thank you for using the Training Program Editor!")
            print("Goodbye!\n")
            break
        else:
            print("\n⚠ Invalid choice. Please enter a number between 1 and 4.\n")


if __name__ == "__main__":
    main()
