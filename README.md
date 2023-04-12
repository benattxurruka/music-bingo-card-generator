# Music bingo card generator
Create your music bingo cards using this tool.

## How to generate and print the bingo cards

1. Navigate to /souce folder
2. Fill songs.txt file with the song names you want to use in the Bingo.
3. Execute CardGenerator.py
4. Print bingoCards.xlsx file in Horizontal and fitting printing size to show all columns.

## How to modify amount and appearance:
You can edit `CardGenerator.py` file to modify:
* The amount of cards to be generated:
    ```
    cards = 100
    ```
* The amount of row and columns each card will have:
    ```
    columns = 3
    rows   = 2
    ```