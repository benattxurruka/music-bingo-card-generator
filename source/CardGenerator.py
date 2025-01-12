#!/usr/bin/env python
import random
import xlsxwriter

song_list = []
try:
    with open("./../songs.txt","r", encoding='utf-8') as f:
        song_list = f.readlines()
except:
    print("Could not read songs.txt file.")

# Card style and number of cards to generate
columns = 3
rows   = 2
cards = 100

min_rand_num = 1
max_rand_num = len(song_list)

# Spreadsheed table formats
workbook = xlsxwriter.Workbook('./../bingoCards.xlsx')
worksheet = workbook.add_worksheet()
cell_format = workbook.add_format()
cell_format.set_align('center')
cell_format.set_border(1)
cell_format.set_border_color('black')
merge_format = workbook.add_format({
    'align':  'center',
    'bold':   True,
    'border': 1,
})

def add_card_to_spreadsheet(bingo_card, row_index):
    worksheet.merge_range(row_index, 0, row_index, 2, "Music Bingo", merge_format)
    row_index += 1
    for col, data in enumerate(bingo_card):
        worksheet.write_column(row_index, col, data, cell_format)
    row_index += rows + 1 # Bingo cards size = amount of rows + title
    return row_index

def generate_cards():
    rand_range = range(min_rand_num, max_rand_num)
    row_index = 0

    try:
        for h in range(cards):
            card_as_numbers = []
            try:
                card_as_numbers = random.sample(rand_range, columns * rows)
            except:
                print("There are not enough songs in the list to generate bingo cards.")
            bingo_card = []
            for i in range(columns):
                bingo_row = []
                for j in range(rows):
                    number = card_as_numbers[i * rows + j]
                    bingo_row.append(song_list[number])
                bingo_card.append(bingo_row)
            row_index = add_card_to_spreadsheet(bingo_card, row_index)
    except:
        print("Bingo cards could not been generated.")

    return row_index > 0 # if greater than 0, cards were generated

def format_and_save_file():
    card_size_with_spaces = rows + 2 # Bingo card row amount + title + space between cards
    for card_index in range(cards):
        worksheet.set_row(card_size_with_spaces * card_index, 30) # Set tite heigh
        for row in range(rows):
            worksheet.set_row(card_size_with_spaces * card_index + row + 1, 50) # Set songs rows height
    worksheet.autofit() # Autofit width
    worksheet.set_column('D:XFD', None, None, {'hidden': True}) # Hide columns after bingo card
    workbook.close()
    print("Music bingo cards generated succesfully.")

def main():
    if (generate_cards()):
        format_and_save_file()
    
main()